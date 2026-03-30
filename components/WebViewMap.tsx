import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet, View } from "react-native";

let WebView: any = null;
try {
  WebView = require("react-native-webview").WebView;
} catch (e) {
  WebView = null;
}

interface WebViewMapProps {
  center: [number, number]; // [lng, lat]
  zoom?: number;
  markers?: Array<{
    id: string;
    coordinate: [number, number]; // [lng, lat]
    title?: string;
    color?: string;
  }>;
  routes?: Array<{
    id: string;
    coordinates: [number, number][]; // [[lng, lat], ...]
    color: string;
    width: number;
    opacity?: number;
  }>;
  userLocation?: { latitude: number; longitude: number; heading?: number };
  interactive?: boolean;
  showMarkerLabels?: boolean;
  style?: any;
  circleOverlay?: {
    center: [number, number]; // [lng, lat]
    radiusKm: number;
  };
}

const WebViewMap = forwardRef(function WebViewMap(
  {
    center,
    zoom = 14,
    markers = [],
    routes = [],
    userLocation,
    interactive = true,
    showMarkerLabels = false,
    style,
    circleOverlay,
  }: WebViewMapProps,
  ref,
) {
  const webViewRef = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    setCamera: ({ centerCoordinate, zoomLevel, animationDuration }: any) => {
      if (!webViewRef.current) return;
      webViewRef.current.injectJavaScript(`
        if (typeof map !== 'undefined') {
          map.flyTo([${centerCoordinate[1]}, ${centerCoordinate[0]}], ${zoomLevel || zoom}, { duration: ${(animationDuration || 500) / 1000} });
        }
        true;
      `);
    },
    fitBounds: (
      ne: [number, number],
      sw: [number, number],
      padding: number[] = [50, 50, 50, 50],
    ) => {
      if (!webViewRef.current) return;
      webViewRef.current.injectJavaScript(`
        if (typeof map !== 'undefined') {
          map.fitBounds([[${sw[1]}, ${sw[0]}], [${ne[1]}, ${ne[0]}]], { padding: [${padding[0]}, ${padding[1]}] });
        }
        true;
      `);
    },
  }));

  // If WebView is not available, show nothing
  if (!WebView) {
    return (
      <View
        style={[
          styles.container,
          style,
          { justifyContent: "center", alignItems: "center" },
        ]}
      ></View>
    );
  }

  const escapedTitle = (title: string) =>
    title.replace(/'/g, "\\'").replace(/"/g, '\\"');

  const markerHtml = markers
    .map(
      (m) => `
    ${
      showMarkerLabels && m.title
        ? `
    L.marker([${m.coordinate[1]}, ${m.coordinate[0]}], {
      interactive: false,
      icon: L.divIcon({
        className: 'custom-marker-label',
        html: '<div style="background: rgba(17,17,17,0.9); color: white; font-size: 10px; font-weight: 600; padding: 4px 7px; border-radius: 8px; max-width: 140px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: center;">${escapedTitle(m.title)}</div>',
        iconSize: [140, 22],
        iconAnchor: [70, -4]
      })
    }).addTo(map);
    `
        : ""
    }
    L.marker([${m.coordinate[1]}, ${m.coordinate[0]}], {
      icon: L.divIcon({
        className: 'custom-marker',
        html: '<div style="width:30px;height:30px;display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" width="30" height="30"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="${m.color || "#ef4444"}"/></svg></div>',
        iconSize: [30, 30],
        iconAnchor: [15, 30]
      })
    }).addTo(map)${m.title ? `.bindPopup('${escapedTitle(m.title)}')` : ""};
  `,
    )
    .join("\n");

  const userMarkerHtml = userLocation
    ? `
    L.circleMarker([${userLocation.latitude}, ${userLocation.longitude}], {
      radius: 8,
      fillColor: '#3b82f6',
      color: 'white',
      weight: 3,
      fillOpacity: 1
    }).addTo(map);
    L.circle([${userLocation.latitude}, ${userLocation.longitude}], {
      radius: 30,
      fillColor: '#3b82f6',
      color: '#3b82f6',
      weight: 1,
      fillOpacity: 0.15
    }).addTo(map);
  `
    : "";

  const routeHtml = routes
    .map(
      (r) => `
    L.polyline([${r.coordinates.map((c) => `[${c[1]}, ${c[0]}]`).join(",")}], {
      color: '${r.color}',
      weight: ${r.width},
      opacity: ${r.opacity || 1}
    }).addTo(map);
  `,
    )
    .join("\n");

  const circleHtml = circleOverlay
    ? `
    L.circle([${circleOverlay.center[1]}, ${circleOverlay.center[0]}], {
      radius: ${circleOverlay.radiusKm * 1000},
      fillColor: '#3b82f6',
      color: '#3b82f6',
      weight: 1,
      fillOpacity: 0.1
    }).addTo(map);
  `
    : "";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        * { margin: 0; padding: 0; }
        html, body, #map { width: 100%; height: 100%; }
        .custom-marker { background: none !important; border: none !important; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', {
          zoomControl: false,
          attributionControl: false,
          dragging: ${interactive},
          touchZoom: ${interactive},
          doubleClickZoom: ${interactive},
          scrollWheelZoom: ${interactive},
          boxZoom: ${interactive}
        }).setView([${center[1]}, ${center[0]}], ${zoom});

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19
        }).addTo(map);

        ${markerHtml}
        ${userMarkerHtml}
        ${routeHtml}
        ${circleHtml}
      </script>
    </body>
    </html>
  `;

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        style={styles.webview}
        scrollEnabled={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={["*"]}
        mixedContentMode="always"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
});

export default WebViewMap;
