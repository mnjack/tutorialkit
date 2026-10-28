// A remark plugin: every link to another site opens in a new tab, so following a lesson's
// "Source:" citation (or any outside link) never leaves the tutorial and its WebContainer
// session. Links within the tutorial keep opening in place.

const EXTERNAL = /^https?:\/\//i;

export function isExternal(url) {
  return typeof url === 'string' && EXTERNAL.test(url.trim());
}

function walk(node) {
  if (node.type === 'link' && isExternal(node.url)) {
    node.data = node.data || {};
    node.data.hProperties = { ...node.data.hProperties, target: '_blank', rel: 'noopener noreferrer' };
  }
  for (const child of node.children || []) walk(child);
}

export function remarkExternalLinks() {
  return (tree) => walk(tree);
}
