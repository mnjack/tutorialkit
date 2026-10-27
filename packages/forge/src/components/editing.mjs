// TutorialKit renders a lesson's workspace (editor, terminal or previews) in the main panel's side
// panel, and only for a lesson that has one (hasWorkspace in @tutorialkit/astro). Its store learns the
// lesson only from that panel, so on a page without it the store may still describe the previous page.
export const WORKSPACE_PANEL = 'resizable-panel[data-id="main"] > [data-id="container"] > [data-id="side-panel"]';
export const NOTHING_TO_EDIT = 'Nothing to edit on this page';

// True when this page has no editor: it has no workspace, or its loaded lesson hides the editor.
export function nothingToEdit(page, store) {
  if (!page.querySelector(WORKSPACE_PANEL)) return true;
  return store.lessonFullyLoaded.get() && !store.hasEditor();
}
