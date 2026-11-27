import { registerPermissionListener } from '../src/permission/permissionContent.ts';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_end',
  main() {
    registerPermissionListener();
  },
});
