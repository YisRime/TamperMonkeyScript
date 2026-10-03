// 页面与宿主注入的扩展点：由 tsc 的报错反推出来，逐条都是产品真的会读写的名字
interface Window {
  GM_addStyle: any;
  GM_addValueChangeListener: any;
  GM_deleteValue: any;
  GM_getTab: any;
  GM_getValue: any;
  GM_listValues: any;
  GM_openInTab: any;
  GM_saveTab: any;
  GM_setValue: any;
  WebKitMutationObserver: any;
  __playerInternals: any;
  _debugMode_: any;
  _hasHackAttachShadow_: any;
  _isPictureInPicture_: any;
  _shadowDomList_: any;
  unsafeWindow: any;
  webkitAudioContext: any;
}
interface Element {
  _attachShadow: any;
  click: any;
  style: any;
}
interface HTMLMediaElement {
  _rawAddEventListener_: any;
  _rawRemoveEventListener_: any;
}
interface Document {
  mozCancelFullScreen: any;
  mozFullScreen: any;
  mozFullScreenElement: any;
  msExitFullscreen: any;
  webkitExitFullscreen: any;
  webkitFullscreenElement: any;
  webkitIsFullScreen: any;
}
interface Function {
  createObjectURL: any;
}
interface MediaSource {
  __objURL__: any;
}
interface Event {
  detail: any;
}
interface JSON {
  // 站点改写 stringify 前留的原件，见 Task 的直播任务
  _stringifySource_: any;
}
