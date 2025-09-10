import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

export const parsePathInput = (
  input: string,
  librariesFolder: string
): { directory: string; name: string } => {
  const cleanPath = input.replace(new RegExp(`^${librariesFolder}\/`), "").replace(/\/$/, "");
  const parts = cleanPath.split("/");
  const name = parts.pop() || "";
  const directory = `${librariesFolder}/${cleanPath.replace(/\/[^\/]+$/, "")}`;
  return { directory: directory.endsWith("/") ? directory : `${directory}/`, name };
};

export const getLibrariesSubpaths = (
  librariesFolder: string,
  excludedFolders: string[]
): string[] => {
  const librariesPath = join(process.cwd(), librariesFolder);
  const subpaths: string[] = [];
  
  if (!existsSync(librariesPath)) return [`${librariesFolder}/`];
  
  const topLevel = readdirSync(librariesPath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .filter(dirent => !excludedFolders.includes(dirent.name))
    .map(dirent => `${librariesFolder}/${dirent.name}/`);
  
  topLevel.forEach(subdir => {
    const subdirPath = join(process.cwd(), subdir);
    if (existsSync(subdirPath)) {
      readdirSync(subdirPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .filter(dirent => !existsSync(join(subdirPath, dirent.name, "project.json")))
        .filter(dirent => !existsSync(join(subdirPath, dirent.name, "src")))
        .forEach(dirent => {
          subpaths.push(`${subdir}${dirent.name}/`);
        });
    }
  });
  
  return [...topLevel, ...subpaths].sort();
};
