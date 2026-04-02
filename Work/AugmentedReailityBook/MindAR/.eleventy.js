const CleanCSS = require("clean-css");
const htmlmin = require("html-minifier-terser");

module.exports = function(eleventyConfig) {
  const isProduction = (process.env.ELEVENTY_ENV || "").trim() === "production";

  // Passthrough Copy: Map the internal app/ folders to the root of the output /dist/
  eleventyConfig.addPassthroughCopy({ "app/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "app/targets": "targets" });
  eleventyConfig.addPassthroughCopy({ "app/pages.json": "pages.json" });

  // Exclude milestones regardless of environment
  eleventyConfig.ignores.add("milestones/**");

  if (isProduction) {
    // HARDENING: Strictly ignore original source folders in production
    eleventyConfig.ignores.add("javascript/**");
    eleventyConfig.ignores.add("style/**");
  } else {
    // DEV: Allow original source folders for local testing/live-reload
    eleventyConfig.addPassthroughCopy({ "app/style": "style" });
    eleventyConfig.addPassthroughCopy({ "app/javascript": "javascript" });
  }

  // Global Data: Environment
  eleventyConfig.addGlobalData("env", { isProduction });
  
  // Custom Filters: CSS Minification
  eleventyConfig.addFilter("cssmin", function(code) {
    return new CleanCSS({}).minify(code).styles;
  });

  // Transform: HTML Minification
  eleventyConfig.addTransform("htmlmin", function(content, outputPath) {
    if (outputPath && outputPath.endsWith(".html")) {
      let minified = htmlmin.minify(content, {
        useShortDoctype: true,
        removeComments: true,
        collapseWhitespace: true,
        minifyJS: true,
        minifyCSS: true,
      });
      return minified;
    }
    return content;
  });

  return {
    dir: {
      input: "app",
      output: "dist",
      includes: "_includes",
      data: "_data"
    },
    templateFormats: ["html", "njk", "md"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
  };
};
