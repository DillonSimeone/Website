const CleanCSS = require("clean-css");
const htmlmin = require("html-minifier-terser");

module.exports = function(eleventyConfig) {
  // Passthrough Copy: Map the internal app/ folders to the root of the output /dist/
  eleventyConfig.addPassthroughCopy({ "app/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "app/targets": "targets" });
  eleventyConfig.addPassthroughCopy({ "app/style": "style" });
  eleventyConfig.addPassthroughCopy({ "app/javascript": "javascript" });
  eleventyConfig.addPassthroughCopy({ "app/pages.json": "pages.json" });

  // Exclude milestones from the production build
  eleventyConfig.ignores.add("app/milestones/**");
  
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
