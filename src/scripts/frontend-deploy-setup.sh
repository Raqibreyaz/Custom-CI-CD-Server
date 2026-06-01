#!/usr/bin/env bash
set -e

# download nodejs
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Installing..."
  curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
  sudo apt-get update
  sudo apt-get install -y nodejs
else
  echo "Node.js already installed: $(node -v)"
fi

# download aws cli sdk
if ! command -v aws >/dev/null 2>&1; then
  echo "AWS CLI not found. Installing..."
  curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "/tmp/awscliv2.zip"
  unzip -q /tmp/awscliv2.zip -d /tmp
  sudo /tmp/aws/install
  rm -rf /tmp/aws /tmp/awscliv2.zip
else
  echo "AWS CLI already installed: $(aws --version 2>&1)"
fi

# download package manager
pm=""

if [ -f pnpm-lock.yaml ]; then
  pm="pnpm"
elif [ -f yarn.lock ]; then
  pm="yarn"
elif [ -f package-lock.json ]; then
  pm="npm"
elif [ -f package.json ]; then
  pm=$(grep -oP '"packageManager"\s*:\s*"\K[^@"]+' package.json || true)
fi

echo "Detected package manager: ${pm:-none}"

if [ "$pm" = "pnpm" ] && ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not installed. Installing..."
  corepack enable || sudo npm install -g corepack
  corepack prepare pnpm@latest --activate
fi

if [ "$pm" = "yarn" ] && ! command -v yarn >/dev/null 2>&1; then
  echo "yarn not installed. Installing..."
  corepack enable || sudo npm install -g corepack
  corepack prepare yarn@stable --activate
fi