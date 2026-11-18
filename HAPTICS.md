# Mobile haptics: implementation and limits

Reviewed 18 November 2026. No physical phone was connected to this build environment.

## Android

`BubbleHaptics.pulse` feature-detects `navigator.vibrate`, catches errors, and records requested/accepted calls. A 13 ms pulse is requested when a pop commits, even if sound is muted. Repeat-tap crinkles request 7 ms. Disabled haptics, hidden documents and destroyed engines do not request vibration.

Support is browser-specific, not simply "all Android phones". MDN's compatibility data lists Chrome for Android and Samsung Internet support; Firefox for Android can expose the method but not physically vibrate. Cross-origin frames, lack of a qualifying user gesture, system vibration settings, and silent/DND behavior can interfere. A `true` return value is not a hardware-confirmation signal.

Primary references:
- https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Navigator.json (vibrate entry)

## iPhone / WebKit

WebKit documents native switch haptic feedback on iPhone in Safari 18. The standard Vibration API remains unavailable in Safari/iOS in MDN compatibility data. WebKit additionally restricted programmatic label clicks: a synthetic click cannot be promoted into a trusted switch click to trigger a haptic.

The fallback therefore uses a real transparent `<label>` as the pointer target, associated with a native `<input type="checkbox" switch>`. Native activation remains the browser's own default action after a trusted tap. The input stays outside the tab order/accessibility tree; the sheet keeps its ordinary accessible region and keyboard controls. There is one label per surface, not one per bubble.

The engine captures the actual label target so the click is not retargeted away from it on release. Movement beyond the tap threshold, cancellation, invalid coordinates, disabled settings, and untrusted clicks suppress native activation. Labels and switches are disposed with their surface or engine.

This yields **best-effort native tap/release feedback**, not programmable vibration. It cannot guarantee haptics timed exactly to the spring's compression threshold, each cell in a finger-drag trail, multi-touch gestures, or keyboard events. Feature detection is not evidence of a physical Taptic Engine or enabled settings. iOS 17.4 switch syntax support alone does not establish the later haptic feature.

Primary references:
- https://webkit.org/blog/15865/webkit-features-in-safari-18-0/ (Switch)
- https://bugs.webkit.org/show_bug.cgi?id=266066
- https://www.mail-archive.com/webkit-changes%40lists.webkit.org/msg250270.html (WebKit commit message, 20 May 2026)
- https://github.com/WebKit/WebKit/commit/fc1ef83eae10068fe468587d959e868041ddfe03 (linked commit; GitHub fetch was unavailable during this run)
- https://github.com/tijnjh/ios-haptics (maintainer's current direct-label activation approach)

This project's adapter is independently implemented; the third-party library is not bundled.

## Tests versus hardware verification

Unit tests cover feature selection, bounded requests, disabled settings, exceptions, and teardown. Browser tests use a vibration spy for the Android code path and injected switch feature detection in Chromium to check trusted label routing and pointer handling. The latter is **not a Safari test** and cannot measure an iPhone motor. `hardwareVerified` deliberately remains false.

## On-device checklist

1. Open the application as a top-level browser page; use current Safari on iPhone or a supporting Android browser. Enable device vibration/system haptics.
2. Open `?panel=show`, find "haptic", enable Haptics and tap Test haptics. Confirm the physical tick yourself; the status cannot sense it.
3. Tap one cell, mute sound and tap another, then turn Haptics off and confirm feedback stops.
4. Confirm reset, two-finger dragging and corner bending remain functional. On iPhone, do not expect programmable haptic pulses for each dragged-over bubble.
