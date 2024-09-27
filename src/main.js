const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');
const path = require('path');

const token = process.env['GITHUB_TOKEN'];
if (!token) {
  throw new Error('GITHUB_TOKEN is not defined in the environment variables');
}
const tag = core.getInput('tag_name');
const tagRef = `tags/${tag}`;
const releaseName = core.getInput('release_name');
const releaseNotes = 'Automatic latest release by GitHub Actions';
const files = core.getInput('files').split(',').filter(file => file);

const owner = github.context.payload.repository.owner.login;
const repo = github.context.payload.repository.name;
const sha = github.context.sha;
core.info(`owner: ${owner}, repo: ${repo}, sha: ${sha}`);

let octokit;

async function initOctokit() {
  const { Octokit } = await import("@octokit/rest");
  octokit = new Octokit({ auth: token });
}

async function deleteReleases() {
  core.info(`Deleting releases for '${tag}'...`);
  try {
    const { data: releases } = await octokit.repos.listReleases({
      owner: owner,
      repo: repo,
    });
    const releasesToDelete = releases.filter(r => r.tag_name === tag);
    if (releasesToDelete.length > 0) {
      for (const release of releasesToDelete) {
        await octokit.repos.deleteRelease({
          owner: owner,
          repo: repo,
          release_id: release.id,
        });
        core.info(`Deleted release for '${release.tag_name}'`);
      }
    } else {
      core.info(`'${tag}' related release does not exist`);
    }
  } catch (err) {
    core.warning(`Failed to delete release '${tag}': ${err.message}`);
  }
}

async function deleteTag() {
  core.info(`Deleting tag '${tag}'...`)
  try {
    const { data: existingRef } = await octokit.git.getRef({
      owner: owner,
      repo: repo,
      ref: tagRef,
    });

    if (existingRef) {
      await octokit.git.deleteRef({
        owner: owner,
        repo: repo,
        ref: tagRef,
      });
      core.info(`Deleted tag '${tag}'`);
    } else {
      core.info(`Tag '${tag}' does not exist`);
    }
  } catch (err) {
    console.warn(`Failed to delete tag '${tag}': ${err.message}`);
  }
}

async function createTag() {
  core.info(`Creating tag '${tag}'...`)
  try {
    await octokit.git.createRef({
      owner: owner,
      repo: repo,
      ref: `refs/tags/${tag}`,
      sha: sha,
    });
    core.info(`Created tag '${tag}'`);
  } catch (err) {
    throw new Error(`Failed to create tag '${tag}': ${err.message}`);
  }
}

async function createRelease() {
  core.info(`Creating release '${tag}'...`)
  try {
    const { data: release } = await octokit.repos.createRelease({
      owner: owner,
      repo: repo,
      tag_name: tag,
      name: releaseName,
      body: releaseNotes,
      draft: true,
      prerelease: false,
    });
    core.info(`Created release '${tag}'`);
    return release.id;
  } catch (err) {
    throw new Error(`Failed to create release '${tag}': ${err.message}`);
  }
}

async function uploadAssets(releaseId) {
  core.info(`Uploading assets for '${tag}'...`)
  for (const asset of files) {
    core.info(`Uploading asset '${asset}'...`)
    const filePath = path.resolve(asset);
    const fileStats = fs.statSync(filePath);
    const fileSize = fileStats.size;
    const fileName = path.basename(filePath);

    const fileStream = fs.createReadStream(filePath);
    const upload = await octokit.rest.repos.uploadReleaseAsset({
      owner: owner,
      repo: repo,
      release_id: releaseId,
      name: fileName,
      data: fileStream,
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': fileSize,
        }
    });
    core.info(`Uploaded asset '${fileName}' with ID ${upload.data.id}`);
  }
}

async function markReleaseAsPublished(releaseId) {
  core.info(`Marking release '${tag}' as published...`)
  try {
    await octokit.repos.updateRelease({
      owner: owner,
      repo: repo,
      release_id: releaseId,
      draft: false,
    });
    core.info(`Marked release '${tag}' as published`);
  } catch (err) {
    throw new Error(`Failed to mark release '${tag}' as published: ${err.message}`);
  }
}

async function run() {
  try {
    await initOctokit();
    await deleteReleases();
    await deleteTag();
    await createTag();
    const releaseId = await createRelease();
    await uploadAssets(releaseId);
    await markReleaseAsPublished(releaseId);
    core.setOutput('release_id', releaseId);
  } catch (err) {
    core.error(err);
    core.setFailed(err.message);
  }
}

run();
