export const API_BASE = import.meta.env.VITE_API_URL || '';

export function isProdApiUrlMissing(): boolean {
  return import.meta.env.PROD && !String(import.meta.env.VITE_API_URL ?? '').trim();
}

export const PROD_API_URL_HINT =
  '未配置线上 API：在仓库 Settings → Actions → Variables 中设置 VITE_API_URL（HTTPS API 根地址，无尾斜杠），保存后重新推送以触发构建。';
