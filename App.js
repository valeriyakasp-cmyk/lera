import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import { StatusBar } from "expo-status-bar";
import { WebView } from "react-native-webview";

// The page is ready once the app root spans the full viewport. A slow device can
// take several seconds to mount, so poll until it does rather than sampling once.
const layoutProbe = `
  (function () {
    var deadline = Date.now() + 20000;
    function report(ready, root) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: "layout",
        ready: ready,
        viewport: window.innerWidth,
        root: root
      }));
    }
    function check() {
      var el = document.getElementById("bizflow-app-root");
      var width = el ? el.getBoundingClientRect().width : 0;
      var viewport = window.innerWidth;
      if (viewport > 0 && width > 0 && Math.abs(viewport - width) <= 2) {
        report(true, width);
      } else if (Date.now() >= deadline) {
        report(false, width);
      } else {
        setTimeout(check, 150);
      }
    }
    check();
  })();
  true;
`;

const webAssets = [
  {
    module: require("./assets/bizflow/BizFlow.html"),
    name: "BizFlow.html",
  },
  {
    module: require("./assets/bizflow/support.txt"),
    name: "support.js",
  },
  // Bundled so the app boots without reaching unpkg.com. BizFlow.html maps the
  // CDN urls to these local copies through window.__resources.
  {
    module: require("./assets/bizflow/vendor/react.txt"),
    name: "react.js",
  },
  {
    module: require("./assets/bizflow/vendor/react-dom.txt"),
    name: "react-dom.js",
  },
  {
    module: require("./assets/bizflow/vendor/babel.txt"),
    name: "babel.js",
  },
];

async function prepareOriginalApp() {
  const folder = `${FileSystem.documentDirectory}bizflow-original/`;
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true });

  await Promise.all(
    webAssets.map(async ({ module, name }) => {
      const asset = Asset.fromModule(module);
      await asset.downloadAsync();
      if (!asset.localUri) throw new Error(`Missing ${name}`);
      const target = `${folder}${name}`;
      const existing = await FileSystem.getInfoAsync(target);
      if (existing.exists) {
        await FileSystem.deleteAsync(target, { idempotent: true });
      }
      await FileSystem.copyAsync({
        from: asset.localUri,
        to: target,
      });
    }),
  );

  return `${folder}BizFlow.html`;
}

function LoadingScreen({ failed }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <View style={styles.loading}>
      <Animated.View
        style={[
          styles.loadingMark,
          {
            opacity: pulse.interpolate({
              inputRange: [0, 1],
              outputRange: [0.88, 1],
            }),
            transform: [
              {
                scale: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.97, 1.03],
                }),
              },
            ],
          },
        ]}
      >
        <Text style={styles.loadingSymbol}>₪</Text>
      </Animated.View>
      <Text style={styles.loadingTitle}>BizFlow</Text>
      {failed ? (
        // Without this the screen would pulse forever and look like a hang.
        <Text style={styles.loadingHint}>
          המסך לא נטען. סגרי את האפליקציה ופתחי אותה מחדש.
        </Text>
      ) : (
        <ActivityIndicator
          style={styles.loadingIndicator}
          size="small"
          color="#69C9EE"
        />
      )}
    </View>
  );
}

export default function App() {
  const [source, setSource] = useState(null);
  const [error, setError] = useState(false);
  const [pageReady, setPageReady] = useState(false);

  useEffect(() => {
    let active = true;
    prepareOriginalApp()
      .then((uri) => {
        if (active) setSource(uri);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <View style={styles.app}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      {source ? (
        <WebView
          source={{ uri: source }}
          allowingReadAccessToURL={source.replace(/BizFlow\.html$/, "")}
          style={[styles.webView, !pageReady && styles.webViewHidden]}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          mixedContentMode="always"
          setSupportMultipleWindows={false}
          mediaPlaybackRequiresUserAction={false}
          keyboardDisplayRequiresUserAction={false}
          hideKeyboardAccessoryView
          allowsBackForwardNavigationGestures={false}
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
          overScrollMode="never"
          onError={() => setError(true)}
          injectedJavaScript={layoutProbe}
          onMessage={(event) => {
            try {
              const result = JSON.parse(event.nativeEvent.data);
              if (result.type !== "layout") return;
              if (result.ready) {
                setPageReady(true);
              } else {
                setError(true);
              }
            } catch {
              setError(true);
            }
          }}
        />
      ) : null}
      {!pageReady && <LoadingScreen failed={error} />}
    </View>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: "#F3F6FB",
    paddingTop: Platform.OS === "android" ? NativeStatusBar.currentHeight : 0,
  },
  webView: {
    flex: 1,
    backgroundColor: "#F3F6FB",
  },
  webViewHidden: {
    opacity: 0,
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F6FB",
  },
  loadingMark: {
    width: 76,
    height: 76,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.96)",
    shadowColor: "#6BCBED",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 5,
  },
  loadingSymbol: {
    color: "#29ADE1",
    fontSize: 35,
    fontWeight: "500",
  },
  loadingTitle: {
    marginTop: 18,
    color: "#111827",
    fontSize: 22,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  loadingIndicator: {
    marginTop: 15,
    transform: [{ scale: 0.82 }],
  },
  loadingHint: {
    marginTop: 14,
    paddingHorizontal: 32,
    color: "#6B7280",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    writingDirection: "rtl",
  },
});
