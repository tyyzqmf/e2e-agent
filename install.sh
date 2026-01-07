#!/bin/bash
#
# E2E Agent Installer
# https://github.com/tyyzqmf/e2e-agent
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/tyyzqmf/e2e-agent/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/tyyzqmf/e2e-agent/main/install.sh | bash -s -- v2.0.0
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
GITHUB_REPO="tyyzqmf/e2e-agent"
BINARY_NAME="e2e"
INSTALL_DIR="${E2E_INSTALL_DIR:-/usr/local/bin}"

# Parse command line arguments
VERSION="${1:-latest}"

print_banner() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════╗"
    echo "║         E2E Agent Installer               ║"
    echo "║   Autonomous E2E Testing Framework        ║"
    echo "╚═══════════════════════════════════════════╝"
    echo -e "${NC}"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Check for required dependencies
check_dependencies() {
    # Check for curl or wget
    if command -v curl >/dev/null 2>&1; then
        DOWNLOADER="curl"
    elif command -v wget >/dev/null 2>&1; then
        DOWNLOADER="wget"
    else
        error "Either curl or wget is required but neither is installed"
        exit 1
    fi

    # Check for jq (optional, for JSON parsing)
    HAS_JQ=false
    if command -v jq >/dev/null 2>&1; then
        HAS_JQ=true
    fi
}

# Download function that works with both curl and wget
download_file() {
    local url="$1"
    local output="$2"

    if [ "$DOWNLOADER" = "curl" ]; then
        if [ -n "$output" ]; then
            curl -fsSL -o "$output" "$url"
        else
            curl -fsSL "$url"
        fi
    elif [ "$DOWNLOADER" = "wget" ]; then
        if [ -n "$output" ]; then
            wget -q -O "$output" "$url"
        else
            wget -q -O - "$url"
        fi
    else
        return 1
    fi
}

# Detect platform
detect_platform() {
    case "$(uname -s)" in
        Darwin)
            OS="macos"
            ;;
        Linux)
            OS="linux"
            ;;
        MINGW*|MSYS*|CYGWIN*)
            error "Windows is not supported. Please use WSL2."
            exit 1
            ;;
        *)
            error "Unsupported operating system: $(uname -s)"
            exit 1
            ;;
    esac

    case "$(uname -m)" in
        x86_64|amd64)
            ARCH="x64"
            ;;
        arm64|aarch64)
            ARCH="arm64"
            ;;
        *)
            error "Unsupported architecture: $(uname -m)"
            exit 1
            ;;
    esac

    PLATFORM="${OS}-${ARCH}"
    info "Detected platform: $PLATFORM"
}

# Get latest release version from GitHub
get_latest_version() {
    local api_url="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"
    local response

    response=$(download_file "$api_url")

    if [ "$HAS_JQ" = true ]; then
        VERSION=$(echo "$response" | jq -r '.tag_name // empty')
    else
        # Fallback: extract tag_name using grep and sed
        VERSION=$(echo "$response" | grep -o '"tag_name"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
    fi

    if [ -z "$VERSION" ]; then
        error "Failed to get latest version from GitHub"
        exit 1
    fi
}

# Verify checksum if checksums.txt is available
verify_checksum() {
    local binary_path="$1"
    local expected_checksum="$2"
    local actual_checksum

    if [ -z "$expected_checksum" ]; then
        warn "Checksum not available, skipping verification"
        return 0
    fi

    if [ "$OS" = "macos" ]; then
        actual_checksum=$(shasum -a 256 "$binary_path" | cut -d' ' -f1)
    else
        actual_checksum=$(sha256sum "$binary_path" | cut -d' ' -f1)
    fi

    if [ "$actual_checksum" != "$expected_checksum" ]; then
        error "Checksum verification failed!"
        error "Expected: $expected_checksum"
        error "Actual:   $actual_checksum"
        rm -f "$binary_path"
        exit 1
    fi

    success "Checksum verified"
}

# Download and install the binary
install_binary() {
    local download_url="https://github.com/${GITHUB_REPO}/releases/download/${VERSION}/${BINARY_NAME}-${PLATFORM}"
    local checksums_url="https://github.com/${GITHUB_REPO}/releases/download/${VERSION}/checksums.txt"
    local temp_dir
    local binary_path
    local expected_checksum=""

    temp_dir=$(mktemp -d)
    binary_path="${temp_dir}/${BINARY_NAME}"

    # Cleanup on exit
    trap "rm -rf '$temp_dir'" EXIT

    info "Downloading ${BINARY_NAME} ${VERSION} for ${PLATFORM}..."

    if ! download_file "$download_url" "$binary_path"; then
        error "Failed to download binary from: $download_url"
        error "Please check if the release exists: https://github.com/${GITHUB_REPO}/releases/tag/${VERSION}"
        exit 1
    fi

    # Try to download and verify checksum
    info "Verifying checksum..."
    local checksums_content
    if checksums_content=$(download_file "$checksums_url" 2>/dev/null); then
        expected_checksum=$(echo "$checksums_content" | grep "${BINARY_NAME}-${PLATFORM}" | awk '{print $1}')
        verify_checksum "$binary_path" "$expected_checksum"
    else
        warn "Checksums file not available, skipping verification"
    fi

    # Make executable
    chmod +x "$binary_path"

    # Install to target directory
    info "Installing to ${INSTALL_DIR}/${BINARY_NAME}..."

    if [ -w "$INSTALL_DIR" ]; then
        mv "$binary_path" "${INSTALL_DIR}/${BINARY_NAME}"
    else
        warn "Need sudo permission to install to ${INSTALL_DIR}"
        sudo mv "$binary_path" "${INSTALL_DIR}/${BINARY_NAME}"
    fi

    success "Binary installed to ${INSTALL_DIR}/${BINARY_NAME}"
}

# Verify installation
verify_installation() {
    if command -v "$BINARY_NAME" >/dev/null 2>&1; then
        local installed_version
        installed_version=$("$BINARY_NAME" version 2>/dev/null || echo "unknown")
        success "Installation verified: ${BINARY_NAME} ${installed_version}"
    else
        warn "${BINARY_NAME} is installed but not in PATH"
        warn "Add ${INSTALL_DIR} to your PATH or run: export PATH=\"\$PATH:${INSTALL_DIR}\""
    fi
}

# Check runtime dependencies
check_runtime_deps() {
    echo ""
    info "Checking runtime dependencies..."

    local missing_deps=()

    # Check for Chrome/Chromium
    if ! command -v google-chrome >/dev/null 2>&1 && \
       ! command -v chromium >/dev/null 2>&1 && \
       ! command -v chromium-browser >/dev/null 2>&1 && \
       ! [ -d "/Applications/Google Chrome.app" ]; then
        missing_deps+=("Chrome/Chromium (required for browser automation)")
    fi

    # Check for Node.js/npx
    if ! command -v npx >/dev/null 2>&1; then
        missing_deps+=("Node.js/npx (required for chrome-devtools-mcp)")
    fi

    if [ ${#missing_deps[@]} -gt 0 ]; then
        warn "Missing optional dependencies:"
        for dep in "${missing_deps[@]}"; do
            echo "  - $dep"
        done
        echo ""
        info "Install these dependencies for full functionality."
    else
        success "All runtime dependencies found"
    fi
}

# Print post-installation instructions
print_instructions() {
    echo ""
    echo -e "${GREEN}════════════════════════════════════════════${NC}"
    echo -e "${GREEN}    Installation Complete!${NC}"
    echo -e "${GREEN}════════════════════════════════════════════${NC}"
    echo ""
    echo "Quick Start:"
    echo "  1. Check environment:  ${BINARY_NAME} check"
    echo "  2. Create test spec:   cp test_spec.txt.template test_spec.txt"
    echo "  3. Submit test job:    ${BINARY_NAME} job submit test_spec.txt"
    echo ""
    echo "Documentation: https://github.com/${GITHUB_REPO}"
    echo ""
}

# Main installation flow
main() {
    print_banner

    check_dependencies
    detect_platform

    # Get version to install
    if [ "$VERSION" = "latest" ]; then
        info "Fetching latest release version..."
        get_latest_version
    fi

    info "Installing version: $VERSION"

    install_binary
    verify_installation
    check_runtime_deps
    print_instructions
}

# Run main function
main "$@"
