import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { requestMicrophoneAccess } from '../src/permission/requestPermission.ts';

export default defineUnlistedScript(() => {
  void requestMicrophoneAccess();
});
