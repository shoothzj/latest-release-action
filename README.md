# latest-release-action

This GitHub actions is used to perform a release of a project. It will create or re-create a release on GitHub and upload
the artifacts to the release. It will also update the latest tag to point to the latest release.

## usage

Add following step to your workflow:

```yaml
- name: Release
  uses: shoothzj/latest-release-action@v1
  with:
    tag_name: latest #(optional) default: latest
    release_name: latest #(optional) default: latest
    files: file1,file2
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```
