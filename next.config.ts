const isGithubPages = process.env.GITHUB_ACTIONS || false;
const repoName = "sistema-riego-frontend"; // Nombre de tu repositorio

const nextConfig = {
  output: "export", // Necesario para GitHub Pages
  basePath: isGithubPages ? `/${repoName}` : "", // Ajuste del path
  images: {
    unoptimized: true, // Deshabilita la optimización de imágenes en GitHub Pages
  },
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL ||
      "https://sistema-riego-api-production.up.railway.app",
  },
};

module.exports = nextConfig;
