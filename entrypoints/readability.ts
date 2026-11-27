import { Readability } from '@mozilla/readability';
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';

export default defineUnlistedScript(() => {
  Object.assign(globalThis, { Readability });
});
