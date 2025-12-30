"""
Skills Configuration
====================

Configuration and utilities for Claude Code skills/plugins.
Skills are modular capabilities that extend Claude's functionality.
"""

from pathlib import Path
from typing import List, Optional


# Default plugin directories (plugins are now inside src/)
DEFAULT_PLUGINS_DIR = Path(__file__).parent / "plugins"

# Default skills to load automatically
DEFAULT_SKILLS = ["frontend-design"]


def get_default_plugins_dir() -> Path:
    """Get the default plugins directory path."""
    return DEFAULT_PLUGINS_DIR


def get_default_skills() -> List[str]:
    """Get the list of default skills to load."""
    return DEFAULT_SKILLS.copy()


def find_skill_plugin_path(skill_name: str, plugins_dir: Optional[Path] = None) -> Optional[Path]:
    """
    Find the plugin path for a given skill name.

    Args:
        skill_name: Name of the skill to find
        plugins_dir: Optional custom plugins directory (defaults to DEFAULT_PLUGINS_DIR)

    Returns:
        Path to the skill plugin directory, or None if not found
    """
    search_dir = plugins_dir or DEFAULT_PLUGINS_DIR
    skill_path = search_dir / skill_name

    if skill_path.exists():
        return skill_path
    return None


def validate_plugin_directory(plugin_path: Path) -> bool:
    """
    Validate that a directory has a valid plugin structure.

    A valid plugin must have either:
    - .claude-plugin/plugin.json file
    - skills/ directory

    Args:
        plugin_path: Path to the plugin directory

    Returns:
        True if valid plugin structure, False otherwise
    """
    if not plugin_path.exists():
        return False

    plugin_json = plugin_path / ".claude-plugin" / "plugin.json"
    skill_dir = plugin_path / "skills"

    return plugin_json.exists() or skill_dir.exists()


def collect_plugin_directories(
    plugin_dirs: Optional[List[Path]] = None,
    load_default_skills: bool = True,
    verbose: bool = True,
) -> List[str]:
    """
    Collect and validate all plugin directories to load.

    Args:
        plugin_dirs: Optional list of additional plugin directories
        load_default_skills: Whether to load default skills (frontend-design, etc.)
        verbose: Whether to print status messages

    Returns:
        List of validated plugin directory paths as strings
    """
    all_plugin_dirs: List[Path] = []

    # Load default skills if enabled
    if load_default_skills:
        for skill_name in DEFAULT_SKILLS:
            skill_plugin_path = DEFAULT_PLUGINS_DIR / skill_name
            if skill_plugin_path.exists():
                all_plugin_dirs.append(skill_plugin_path)
            elif verbose:
                print(f"Warning: Default skill '{skill_name}' not found in {DEFAULT_PLUGINS_DIR}")

    # Add user-specified plugin directories
    if plugin_dirs:
        all_plugin_dirs.extend(plugin_dirs)

    # Validate and deduplicate
    validated_plugin_dirs: List[str] = []
    for plugin_dir in all_plugin_dirs:
        plugin_path = Path(plugin_dir).resolve()

        if not plugin_path.exists():
            if verbose:
                print(f"Warning: Plugin directory does not exist: {plugin_path}")
            continue

        if validate_plugin_directory(plugin_path):
            # Avoid duplicates
            path_str = str(plugin_path)
            if path_str not in validated_plugin_dirs:
                validated_plugin_dirs.append(path_str)
                if verbose:
                    print(f"   - Loading plugin: {plugin_path.name}")
        elif verbose:
            print(f"Warning: Invalid plugin structure at: {plugin_path}")
            print(f"         Expected .claude-plugin/plugin.json or skills/ directory")

    return validated_plugin_dirs


def load_skill_content(skill_name: str, plugins_dir: Optional[Path] = None) -> Optional[str]:
    """
    Load the SKILL.md content for a given skill.

    Args:
        skill_name: Name of the skill
        plugins_dir: Optional custom plugins directory

    Returns:
        Content of SKILL.md file, or None if not found
    """
    search_dir = plugins_dir or DEFAULT_PLUGINS_DIR

    # Try standard plugin structure: plugins/<skill>/skills/<skill>/SKILL.md
    skill_md_path = search_dir / skill_name / "skills" / skill_name / "SKILL.md"

    if skill_md_path.exists():
        return skill_md_path.read_text()

    # Try alternative structure: plugins/<skill>/SKILL.md
    alt_path = search_dir / skill_name / "SKILL.md"
    if alt_path.exists():
        return alt_path.read_text()

    return None
