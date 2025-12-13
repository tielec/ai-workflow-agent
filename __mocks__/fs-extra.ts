import { createFsExtraMock } from '../tests/helpers/fs-extra-mock.js';

const mockModule = createFsExtraMock();
const mockFs = mockModule.default as Record<string, any>;

export const __esModule = true;

export const {
  existsSync,
  pathExistsSync,
  ensureDirSync,
  mkdirSync,
  mkdirpSync,
  ensureDir,
  readFileSync,
  writeFileSync,
  readJsonSync,
  writeJsonSync,
  readJSON,
  writeJSON,
  statSync,
  lstatSync,
  readdirSync,
  removeSync,
  copyFileSync,
  remove,
  copy,
  lstat,
} = mockFs;

export default mockFs;
