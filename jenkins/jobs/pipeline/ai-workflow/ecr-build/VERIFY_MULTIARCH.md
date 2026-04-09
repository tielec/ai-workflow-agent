# ECR Multi-arch Image 検証手順

本ドキュメントは、`ecr-build` Job で作成された ECR イメージが
linux/amd64 + linux/arm64 のマルチアーキ（image index）となっていることを
確認するための手順をまとめたものです。

## 1. 前提

- AWS CLI が利用可能なローカル環境または Jenkins ノード
- ECR へのアクセス権限（`ecr:DescribeImages`, `ecr:GetDownloadUrlForLayer`, `ecr:BatchGetImage`）
- Docker CLI（`docker manifest inspect` を利用するため Docker 20.10+ を推奨）

## 2. 確認手順

### 2.1 ECR ログイン

```bash
AWS_REGION=ap-northeast-1
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
ECR_REPOSITORY_NAME=ai-workflow-agent
ECR_IMAGE_NAME="${ECR_REGISTRY}/${ECR_REPOSITORY_NAME}"

aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${ECR_REGISTRY}"
```

### 2.2 docker manifest inspect による確認

```bash
docker manifest inspect "${ECR_IMAGE_NAME}:latest"
```

**期待出力（抜粋）**:

```json
{
  "schemaVersion": 2,
  "mediaType": "application/vnd.oci.image.index.v1+json",
  "manifests": [
    {
      "mediaType": "application/vnd.oci.image.manifest.v1+json",
      "platform": {
        "architecture": "amd64",
        "os": "linux"
      }
    },
    {
      "mediaType": "application/vnd.oci.image.manifest.v1+json",
      "platform": {
        "architecture": "arm64",
        "os": "linux"
      }
    }
  ]
}
```

**成功判定**: `manifests[]` に `amd64` と `arm64` の両方が含まれていること。

`build-<N>` タグも同様に確認します。

```bash
docker manifest inspect "${ECR_IMAGE_NAME}:build-<BUILD_NUMBER>"
```

### 2.3 AWS CLI による確認

```bash
aws ecr describe-images \
  --repository-name "${ECR_REPOSITORY_NAME}" \
  --region "${AWS_REGION}" \
  --image-ids imageTag=latest \
  --query 'imageDetails[0].{digest:imageDigest,tags:imageTags,artifactMediaType:artifactMediaType}' \
  --output table
```

`artifactMediaType` が `application/vnd.oci.image.index.v1+json` または
`application/vnd.docker.distribution.manifest.list.v2+json` のいずれかであること。

### 2.4 Jenkins CLI による Jenkinsfile 構文チェック（参考）

```bash
# Jenkins URL と認証情報を事前に設定
JENKINS_URL="https://your-jenkins-url"
JENKINS_USER="your-user"
JENKINS_TOKEN="your-token"

curl -X POST -u "${JENKINS_USER}:${JENKINS_TOKEN}" \
  -F "jenkinsfile=<jenkins/jobs/pipeline/ai-workflow/ecr-build/Jenkinsfile" \
  "${JENKINS_URL}/pipeline-model-converter/validate"
```

## 3. トラブルシューティング

### 3.1 `manifests[]` が存在しない（single-arch の場合）

- **原因**: `docker build` + `docker push` の旧フローが残っている
- **対処**: `ecr-build` Job を最新の Jenkinsfile で再実行

### 3.2 `binfmt` 登録が失敗する

- **原因**: `Setup QEMU` ステージで `docker run --privileged` が拒否された
- **対処**: ノード側で `docker run --privileged --rm hello-world` を試行し、権限を確認

### 3.3 buildx ビルドが途中でタイムアウト

- **原因**: QEMU エミュレーションによるビルド時間増
- **対処**: Jenkinsfile の `timeout(time: 30, unit: 'MINUTES')` を 45〜60 分に延長（要レビュー）
