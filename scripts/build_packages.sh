#!/bin/bash

# Script to build core package first, then all other packages except agent and docs

# Exit on error
set -e

# Enable verbose mode for debugging
set -x

# Start from the project root
ROOT_DIR=$(pwd)
echo "Starting package builds from: $ROOT_DIR"

# Check if packages directory exists
if [ ! -d "$ROOT_DIR/packages" ]; then
  echo "Error: packages directory not found!"
  exit 1
fi

# First, build the core package
if [ -d "$ROOT_DIR/packages/core" ]; then
  echo "Building core package first..."
  cd "$ROOT_DIR/packages/core"
  
  if [ -f "package.json" ]; then
    if grep -q '"build":' package.json; then
      echo "Building core..."
      # Make sure dependencies are installed
      bun install
      # Try running the build script directly instead of through turbo
      bun run build
      
      # Check if dist directory was created
      if [ ! -d "dist" ]; then
        echo "Warning: dist directory was not created for core package!"
      else
        echo "Successfully created dist directory for core package."
      fi
    else
      echo "No build script found for core, skipping..."
    fi
  else
    echo "No package.json found for core, skipping..."
  fi
  
  cd "$ROOT_DIR"
else
  echo "Warning: core package directory not found!"
fi

# Then loop through each package
for package_dir in "$ROOT_DIR/packages"/*; do
  if [ -d "$package_dir" ]; then
    package_name=$(basename "$package_dir")
    
    # Skip agent, docs, and core packages
    if [ "$package_name" == "agent" ] || [ "$package_name" == "docs" ] || [ "$package_name" == "core" ]; then
      echo "Skipping $package_name package"
      continue
    fi
    
    echo "Processing package: $package_name"
    
    # Navigate to package directory
    cd "$package_dir"
    
    # Check if package.json exists and has a build script
    if [ -f "package.json" ]; then
      if grep -q '"build":' package.json; then
        echo "Building $package_name..."
        # Make sure dependencies are installed
        bun install
        # Run the build script directly instead of through turbo
        bun run build
        
        # Check if dist directory was created
        if [ ! -d "dist" ]; then
          echo "Warning: dist directory was not created for $package_name package!"
        else
          echo "Successfully created dist directory for $package_name package."
        fi
      else
        echo "No build script found for $package_name, skipping..."
      fi
    else
      echo "No package.json found for $package_name, skipping..."
    fi
    
    # Return to root directory
    cd "$ROOT_DIR"
  fi
done

echo "All packages built successfully!" 