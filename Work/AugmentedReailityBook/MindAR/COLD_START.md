# AR Book Project Guide

This guide explains how to get the project running on your computer and how to prepare it for the web.

## Getting Started

You will need to have Node.js installed on your computer first. 

1. Open your terminal or command prompt in the project folder.
2. Type the following command and press Enter:
   ```bash
   npm install
   ```
   This will set up all the necessary tools for the project.

## Running the Project Locally

To see the website on your own computer while you work:

1. In your terminal, type:
   ```bash
   npm start
   ```
2. Open your web browser and go to `http://localhost:8080`. 

The page will automatically refresh whenever you save changes to your files.

## Preparing for Deployment

When you are ready to put the website online, you need to create a "production" version. This version is optimized to load quickly for users.

1. In your terminal, type:
   ```bash
   npm run build
   ```
2. This will create a folder called `dist`. 

The `dist` folder contains everything needed for the website to work. You only need to upload the contents of this folder to your web server or hosting provider (like Cloudflare Pages or Netlify).

## Summary of Folders

- app: This is where you do your work and edit files.
- dist: This is the final version of the site created by the build command. You should not edit files here directly.

Scanner S/N: 06182012-G
Ref: F.P.
