export interface Route {
  path: string;
  params: URLSearchParams;
}

export function currentRoute(): Route {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path = '/', query = ''] = raw.split('?');
  return { path, params: new URLSearchParams(query) };
}

export function studyHref(mode: string, params: Record<string, string> = {}): string {
  const search = new URLSearchParams({ mode, ...params });
  return `#/study?${search.toString()}`;
}
