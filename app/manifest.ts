import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "لوحة العمل",
    short_name: "لوحة العمل",
    lang: "ar",
    dir: "rtl",
    start_url: "/",
    display: "standalone",
    background_color: "#F4F5F8",
    theme_color: "#14213D",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
