module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/js");

  return {
    pathPrefix: "/westmoreland-biodiversity/",
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
    },
  };
};
