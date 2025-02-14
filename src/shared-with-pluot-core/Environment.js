// Note: Bowser is only used for OS detection, not Browser detection
import Bowser from 'bowser';

// This method should be used instead of window.navigator.userAgent, which
// is not defined in React Native and results in an error.
// (Actually, if it *is* defined in React Native, it's not meant for us, but
// for our customer's code; that's why we don't just simply override it globally).
export function getUserAgent() {
  if (
    !isReactNative() &&
    typeof window !== 'undefined' &&
    window.navigator &&
    window.navigator.userAgent
  ) {
    return window.navigator.userAgent;
  }
  return '';
}

// This method should be used instead of window.navigator.maxTouchPoints, which
// is not defined in React Native and results in an error.
export function getMaxTouchPoints() {
  if (
    !isReactNative() &&
    typeof window !== 'undefined' &&
    window?.navigator?.maxTouchPoints
  ) {
    return window.navigator.maxTouchPoints;
  }
  return 0;
}

export function isReactNative() {
  // Wondering why we're relying on navigator.product instead of changing the
  // below check to read isReactNativeIOS() || isReactNativeAndroid()?
  // Two reasons:
  // 1. Juuuust in case of other platforms someday!
  // 2. isReactNativeIOS/Android() only work in newer versions of
  //    react-native-daily-js; we wouldn't want to unintentionally break older
  //    versions
  return (
    typeof navigator !== 'undefined' &&
    navigator.product &&
    navigator.product === 'ReactNative'
  );
}

export function isReactNativeUnifiedPlan() {
  return isReactNative() && typeof RTCRtpTransceiver !== 'undefined';
}

export function isReactNativeIOS() {
  if (
    typeof DailyNativeUtils === 'undefined' ||
    DailyNativeUtils.isIOS === undefined
  ) {
    return false;
  }
  return DailyNativeUtils.isIOS;
}

export function isReactNativeAndroid() {
  if (
    typeof DailyNativeUtils === 'undefined' ||
    DailyNativeUtils.isAndroid === undefined
  ) {
    return false;
  }
  return DailyNativeUtils.isAndroid;
}

export function isIOS() {
  const userAgent = getUserAgent();
  return !!userAgent.match(/iPad|iPhone|iPod/i);
}

// Only valid if cam/mic are accessible from browser
export function isUserMediaAccessible() {
  return (
    navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia
  );
}

// Returns whether we should allow screen sharing from this browser.
//
// Note: technically we *could* try to support screen sharing from any browser where
// isDisplayMediaAccessible() is true (PeerToPeer.js is mostly set up to do so).
// However, limiting screen sharing to only those that support the Unified Plan SDP
// format lets us simplify code paths on the receiving end of screen shares: in order
// to check whether to always expect a single inbound video track, we simply have to
// check whether we're a browser that only supports the older Plan B SDP format (see below).
// Additionally, limiting screen sharing this way reduces our test matrix.
export function isScreenSharingSupported() {
  return isDisplayMediaAccessible() && (canUnifiedPlan() || isReactNative());
}

export function isFullscreenSupported() {
  if (isReactNative()) return false;
  if (!document) return false;
  const iframe = document.createElement('iframe');
  return !!iframe.requestFullscreen || !!iframe.webkitRequestFullscreen;
}

function _determineWebGLAvailability() {
  try {
    let canvas = document.createElement('canvas');
    let gl = canvas.getContext('webgl2');
    let isWebglAvailable = gl != null;
    canvas.remove();
    return isWebglAvailable;
  } catch (err) {
    return false;
  }
}
const _isWebGLAvailable = _determineWebGLAvailability();
export function isWebGLAvailable() {
  return _isWebGLAvailable;
}

export function canLoadBanuba() {
  return isWebGLAvailable() && isVideoProcessingSupportedInBrowser_Banuba();
}

export function isVideoProcessingSupported(usingLegacyProvider = false) {
  if (isReactNative()) return false;

  if (!isWebGLAvailable()) return false;

  if (usingLegacyProvider) {
    return isVideoProcessingSupportedInBrowser_MediaPipe();
  } else {
    return isVideoProcessingSupportedInBrowser_Banuba();
  }
}

function isVideoProcessingSupportedInBrowser_MediaPipe() {
  if (browserMobile_p()) {
    return false;
  }

  return ['Chrome', 'Firefox'].includes(getBrowserName());
}

function isVideoProcessingSupportedInBrowser_Banuba() {
  // TODO: we *should* be able to support mobile browsers someday by removing
  // the below check.
  // Remaining work before that can be done:
  // - On iOS, more gracefully handle the "interrupted" state that occurs when
  //   backgrounding the browser or switching to a new tab (it currently results
  //   in very visually weird state).
  // - Consider whether we should have a set of mobile-specific "preset"
  //   background images; the set we have is tuned to look best on desktop.
  //   (Preset background images might not be an important enough feature for it
  //   for it to be worth our while, though...especially since the background
  //   images look passable on mobile).
  // - Spend more time tuning the auto-shutoff mechanism and processing settings
  //   for much-more-often-CPU-constrained mobile devices (especially Android
  //   devices). On my Galaxy A50:
  //     - if the the auto-shutoff mechanism is enabled, if fires all the time
  //     - if the auto-shutoff mechanism is disabled, the CPU spikes to the
  //       point of starving video decoding, even on a 1:1 call, causing either
  //       the local or remote video to appear interrupted
  if (browserMobile_p()) {
    return false;
  }

  const browserName = getBrowserName();

  // Banuba requires OpenGL 4.3 and up which is not available on Safari < 15
  // https://docs.banuba.com/face-ar-sdk-v1/overview/system_requirements
  // Also, we exclude Safari 15.0..<15.4 on iOS, due to a bug.
  // See underyling bug https://bugs.webkit.org/show_bug.cgi?id=232195, which
  // manifested as https://bugs.webkit.org/show_bug.cgi?id=232076, which led
  // Banuba to recommend Safari-specific workaround https://docs.banuba.com/face-ar-sdk-v1/web/web_known_issues/#effect-animations-are-delayed-on-safari.
  // Given that the underlying bug has since been fixed, for now it makes sense
  // to simply exclude the problematic versions of Safari, especially because
  // they are tied to now-rather-old OS versions.
  if (browserName === 'Safari') {
    const version = getSafariVersion();
    if (version.major < 15 || (version.major === 15 && version.minor < 4)) {
      return false;
    }
  }

  // Banuba will crash the browser on Chrome versions older than 77
  if (browserName === 'Chrome') {
    const version = getChromeVersion();
    return version.major >= 77;
  }

  // Banuba crashes in older versions with:
  // Error: GPU operations complete wait failed
  if (browserName === 'Firefox') {
    const version = getFirefoxVersion();
    return version.major >= 97;
  }

  return ['Chrome', 'Firefox', 'Safari'].includes(browserName);
}

export function isAudioProcessingSupported() {
  // Using Krisp's compatibility, since they're currently our only audio processor
  if (isReactNative()) return false;
  // Krisp still rather janky on Android
  if (isAndroidWeb()) return false;
  // But Krisp uses an AudioWorkletNode, which isn't available in older Safari
  if (typeof AudioWorkletNode === 'undefined') return false;

  switch (getBrowserName()) {
    case 'Chrome':
    case 'Firefox':
      return true;
    case 'Safari':
      return getBrowserVersion().major >= 17 && getBrowserVersion().minor >= 4;
  }
  return false;
}

export function browserSupportsLocalAudioLevelObservers() {
  // local audio level observers depend on AudioContext Worklets.addModule(),
  // which isn't available on older Safari version < 14.1 (Same as
  // AudioWorkletNode)
  // https://developer.mozilla.org/en-US/docs/Web/API/Worklet/addModule
  if (typeof AudioWorkletNode === 'undefined') return false;
  return true;
}

export function canUnifiedPlan() {
  return browserCanUnifiedPlan(getBrowserName(), getBrowserVersion());
}

export function browserCanUnifiedPlan(browserName, browserVersion) {
  if (!(browserName && browserVersion)) {
    return true;
  }
  switch (browserName) {
    case 'Chrome':
      return browserVersion.major >= 75;
    case 'Safari':
      // This is the check that Apple suggests in https://webkit.org/blog/8672/on-the-road-to-webrtc-1-0-including-vp8/,
      // plus a workaround that was already in place here for a Safari 13.0.0 bug, forcing it into Plan B.
      return (
        RTCRtpTransceiver.prototype.hasOwnProperty('currentDirection') &&
        !(
          browserVersion.major === 13 &&
          browserVersion.minor === 0 &&
          browserVersion.point === 0
        )
      );
    // Note: We now only support Firefox 80+ so this should always be true
    case 'Firefox':
      return browserVersion.major >= 67;
  }
  return true;
}

export function browserVideoSupported_p() {
  return isUserMediaAccessible() && !browserNeedsUpgrade();
}

export function isAndroidApp() {
  return getUserAgent().match(/DailyAnd\//);
}

export function isAndroidWeb() {
  return getUserAgent().match(/Linux; Android/);
}

export function browserMobile_p() {
  const userAgent = getUserAgent();
  // Testing on iOS and iPad both return 05 touch points.
  const isIosMobile = userAgent.match(/Mac/) && getMaxTouchPoints() >= 5;
  if (userAgent.match(/Mobi/) || userAgent.match(/Android/) || isIosMobile) {
    return true;
  }
  if (isAndroidApp()) {
    return true;
  }
}

export function browserNeedsUpgrade() {
  let browser = getBrowserName(),
    ua = getUserAgent(),
    version;
  if (!ua) {
    return true;
  }
  switch (browser) {
    case 'Chrome':
      // Includes Chromium-based browsers
      version = getChromeVersion();
      return version.major && version.major > 0 && version.major < 75;
    case 'Firefox':
      version = getFirefoxVersion();
      return version.major < 91;
    case 'Safari':
      version = getSafariVersion();
      return version.major < 13 || (version.major === 13 && version.minor < 1);
    default:
      return true;
  }
}

export function getBrowserName() {
  if (typeof window !== 'undefined') {
    const userAgent = getUserAgent();
    // Treat supported WKWebView as Safari. Check for this first just in case
    // 3rd-party browsers on iOS decide to customize their user agent strings to
    // match the other conditions.
    if (isSupportedIOSEnvironment()) {
      return 'Safari';
    } else if (userAgent.indexOf('Edge') > -1) {
      // Note: check will (purposefully) fail for chromium-based Edge
      // since the user-agent for chromium-based Edge reports `Edg`
      // (or EdgA (android) or EdgiOS)
      // Also note: getBrowserName is primarily used for internal
      //   logic, so this should go away eventually. However, it is used
      //   in the old prebuilt UI for some upgrade messaging so leaving
      //   it in until Edge or the old prebuilt is really no longer a thing
      return 'Edge';

      // }  else if (userAgent.indexOf('OPR') > -1 ||
      //            userAgent.indexOf('Opera') > -1) {
      //   return 'Opera';
    } else if (userAgent.match(/Chrome\//)) {
      // Includes Chromium-based browsers
      return 'Chrome';
    } else if (userAgent.indexOf('Safari') > -1 || isSupportedAppleEngine()) {
      return 'Safari';
    } else if (userAgent.indexOf('Firefox') > -1) {
      return 'Firefox';
    } else if (
      userAgent.indexOf('MSIE') > -1 ||
      userAgent.indexOf('.NET') > -1
    ) {
      return 'IE';
    } else {
      return 'Unknown Browser';
    }
  }
}

export function getBrowserVersion() {
  let name = getBrowserName();
  switch (name) {
    case 'Chrome':
      // Includes Chromium-based browsers
      return getChromeVersion();
    case 'Safari':
      return getSafariVersion();
    case 'Firefox':
      return getFirefoxVersion();
    case 'Edge':
      return getEdgeVersion();
  }
}

export function getChromeVersion() {
  let major = 0,
    minor = 0,
    build = 0,
    patch = 0,
    opera = false;
  if (typeof window !== 'undefined') {
    const userAgent = getUserAgent(),
      match = userAgent.match(/Chrome\/(\d+).(\d+).(\d+).(\d+)/);
    if (match) {
      try {
        major = parseInt(match[1]);
        minor = parseInt(match[2]);
        build = parseInt(match[3]);
        patch = parseInt(match[4]);
        opera = userAgent.indexOf('OPR/') > -1;
      } catch (e) {}
    }
  }
  return { major, minor, build, patch, opera };
}

// Mobile Safari or WKWebView on iOS/iPadOS >= 14.3
export function isSupportedIOSEnvironment() {
  return isIOS() && isUserMediaAccessible();
}

export function isSupportedAppleEngine() {
  let userAgent = getUserAgent();
  // This identifies the browser's rendering engine, AppleWebKit, which is used by browsers
  // like Safari and, on iOS, sometimes by Chrome. When using the Ionic framework or WKWebView,
  // the user agent may not always explicitly indicate it's from a mobile device.
  // However, since it uses Apple's WebKit engine, it can be treated as Safari for handling purposes.
  // Example:
  // Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)
  // Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 iOS Mobile
  return userAgent.indexOf('AppleWebKit/605.1.15') > -1;
}

function isDisplayMediaAccessible() {
  return !!(
    navigator &&
    navigator.mediaDevices &&
    navigator.mediaDevices.getDisplayMedia
  );
}

function getSafariVersion() {
  let major = 0,
    minor = 0,
    point = 0;
  if (typeof window !== 'undefined') {
    const userAgent = getUserAgent(),
      match = userAgent.match(/Version\/(\d+).(\d+)(.(\d+))?/);
    if (match) {
      try {
        major = parseInt(match[1]);
        minor = parseInt(match[2]);
        point = parseInt(match[4]);
      } catch (e) {}
    } else if (isSupportedIOSEnvironment() || isSupportedAppleEngine()) {
      // Hack: treat supported WKWebView like Safari 14.0.3 (no need to be
      // precise; just needs to be new enough to appear supported, and this was
      // the Safari version around the time WKWebView WebRTC support was added)
      major = 14;
      minor = 0;
      point = 3;
    }
  }
  return { major, minor, point };
}

function getFirefoxVersion() {
  let major = 0,
    minor = 0;
  if (typeof window !== 'undefined') {
    const userAgent = getUserAgent(),
      match = userAgent.match(/Firefox\/(\d+).(\d+)/);
    if (match) {
      try {
        major = parseInt(match[1]);
        minor = parseInt(match[2]);
      } catch (e) {}
    }
  }
  return { major, minor };
}

function getEdgeVersion() {
  let major = 0,
    minor = 0;
  if (typeof window !== 'undefined') {
    const userAgent = getUserAgent(),
      match = userAgent.match(/Edge\/(\d+).(\d+)/);
    if (match) {
      try {
        major = parseInt(match[1]);
        minor = parseInt(match[2]);
      } catch (e) {}
    }
  }
  return { major, minor };
}

export function getOSName() {
  let OSName = 'Unknown';
  if (isReactNative()) {
    if (
      window &&
      window.DailyNativeUtils &&
      window.DailyNativeUtils.platform &&
      window.DailyNativeUtils.platform.OS
    ) {
      // in case bowser changes its consts, we don't have to
      if (window.DailyNativeUtils.platform.OS === 'ios') {
        OSName = 'iOS';
      } else if (window.DailyNativeUtils.platform.OS === 'android') {
        OSName = 'Android';
      } else {
        OSName = window.DailyNativeUtils.platform.OS;
      }
    }
    return OSName;
  }

  // platform module
  if (
    typeof window !== 'undefined' &&
    window.navigator &&
    window.navigator.userAgent
  ) {
    try {
      let navAgentInfo = Bowser.getParser(window.navigator.userAgent);
      let bowserName = navAgentInfo.getOSName();
      // this seems unnecessary, i know. but it defends against
      // changes to bowser
      switch (bowserName) {
        case 'macOS':
          OSName = 'macOS';
          break;
        case 'Windows':
          OSName = 'Windows';
          break;
        case 'Linux':
          OSName = 'Linux';
          break;
        case 'iOS':
          OSName = 'iOS';
          break;
        case 'Android':
          OSName = 'Android';
          break;
        default:
          OSName = bowserName;
          break;
      }
    } catch (error) {
      console.log('bowser error', error);
      // pass
    }
  }
  return OSName;
}

export function isAudioOutputSelectionDisallowed() {
  // Disallow audio output selection if we're on a version of Firefox where
  // doing so (using setSinkId) results in echo cancellation breaking.
  //
  // Note that prior to the "broken" version of Firefox, audio output device
  // selection wasn't supported in Firefox anyway; it was a new feature that
  // shipped with a show-stopping bug. So by disallowing audio output selection,
  // we're just carrying forward Firefox's old (but still pretty recent)
  // behavior until the bug is fixed.
  //
  // Once the fix lands (https://bugzilla.mozilla.org/show_bug.cgi?id=1849108),
  // we'll need to release another version of daily-js enabling audio output
  // selection for newer versions of Firefox that include the fix.
  return (
    getBrowserName() === 'Firefox' &&
    getBrowserVersion().major > 115 &&
    getBrowserVersion().major < 123
  );
}
