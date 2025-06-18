#!/bin/bash
# filepath: vcrBuild.sh

# Install dependencies (skip postinstall if you use husky or similar)
npm install --ignore-scripts

# Build the React app
npm run build