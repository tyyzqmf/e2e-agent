# Installation Guide

## One-Line Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/tyyzqmf/e2e-agent/main/install.sh | bash
```

This will:
- Download the latest release
- Install to `~/.e2e-agent/`
- Add `e2e` command to your PATH

### Install Specific Version

```bash
curl -fsSL https://raw.githubusercontent.com/tyyzqmf/e2e-agent/main/install.sh | bash -s -- v2.0.0
```

### Verify Installation

```bash
e2e version
e2e check
```

## Build From Source

### Prerequisites

1. **Install Bun**
   ```bash
   curl -fsSL https://bun.sh/install | bash
   source ~/.bashrc  # or ~/.zshrc
   ```

2. **Install Node.js**
   ```bash
   # Ubuntu/Debian
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs

   # macOS
   brew install node
   ```

3. **Install Chrome/Chromium**
   ```bash
   # Ubuntu/Debian
   sudo apt-get install -y chromium-browser

   # macOS
   brew install --cask google-chrome
   ```

### Clone and Build

```bash
# Clone repository
git clone https://github.com/tyyzqmf/e2e-agent.git
cd e2e-agent

# Install dependencies
bun install

# Verify installation
./e2e --help
```

### Add to PATH (Optional)

To use `e2e` command globally:

```bash
# Create symlink
sudo ln -s $(pwd)/e2e /usr/local/bin/e2e

# Or add to PATH in ~/.bashrc or ~/.zshrc
export PATH="$PATH:/path/to/e2e-agent"
```

## System Requirements

- **Operating System**: Linux, macOS, or WSL2
- **Bun**: >= 1.0.0
- **Node.js**: >= 18.0.0
- **Chrome/Chromium**: Latest stable version
- **Disk Space**: ~500MB for installation
- **Memory**: 2GB minimum (4GB recommended)

## Next Steps

After installation:
1. [Configure API credentials](configuration.md)
2. [Follow quick start guide](../quick-start.md)
3. [Learn CLI commands](cli-reference.md)
