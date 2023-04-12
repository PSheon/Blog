// ** React Import
import React from "react";

// ** Nextra Imports
import { DocsThemeConfig } from "nextra-theme-docs";

// ** Components Imports
import Logo from "src/components/shared/Logo";

const config: DocsThemeConfig = {
  logo: <Logo />,
  project: {
    link: "https://github.com/PSheon/Blog",
  },
  // chat: {
  //   link: "https://discord.com",
  // },
  // docsRepositoryBase: "https://github.com/shuding/nextra-docs-template",
  // footer: {
  //   component: <Fragment />,
  // },
};

export default config;
