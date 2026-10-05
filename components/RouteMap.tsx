import { Camera, GeoJSONSource, Layer, Map, type CameraRef } from '@maplibre/maplibre-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import type { Fix } from '@/lib/cardio';
import { MAP_ATTRIBUTION, MAP_ROUTE_BLUE, casingFor, mapStyleUrl, type MapStyleId } from '@/lib/map-style';
import { pointGeoJson, projectToBox, routeBounds, routeGeoJson } from '@/lib/route-geometry';
import { colors, fonts, themedStyles } from '@/lib/theme';

type Here = { lat: number; lon: number; accuracy: number | null };

/**
 * The route on a map: a blue line of where you've been and a blue dot for
 * where you are (the user's spec, exactly).
 *
 * - `follow`: the camera keeps the dot centred, for recording.
 * - otherwise it frames the whole route, for the summary.
 *
 * With no signal the tiles cannot load. The route is still recorded, so it is
 * drawn on a plain grid instead, with a line saying why — never a spinner and
 * never a blank box.
 */
export function RouteMap({
  fixes,
  here,
  styleId,
  follow,
  showEnds,
  bottomInset = 0,
  recenterKey = 0,
  dotColour = MAP_ROUTE_BLUE,
  lineColour = MAP_ROUTE_BLUE,
}: {
  fixes: readonly Fix[];
  here: Here | null;
  styleId: MapStyleId;
  follow: boolean;
  /** Start and finish markers, for a finished session. */
  showEnds?: boolean;
  /** Space covered by panels at the bottom, so the dot is centred in what shows. */
  bottomInset?: number;
  /** Bump to snap back to the dot after panning away. */
  recenterKey?: number;
  /** From Settings → Map; blue unless changed. */
  dotColour?: string;
  lineColour?: string;
}) {
  const camera = useRef<CameraRef>(null);
  const [failed, setFailed] = useState(false);
  const route = useMemo(() => routeGeoJson(fixes), [fixes]);
  const bounds = useMemo(() => routeBounds(fixes), [fixes]);
  const first = fixes[0];
  const last = fixes[fixes.length - 1];

  // A style change is a new chance to load: signal may have come back.
  const [failedFor, setFailedFor] = useState(styleId);
  if (failedFor !== styleId) {
    setFailedFor(styleId);
    setFailed(false);
  }

  // Zoom in on the first fix and on "centre on me"; in between, only pan, so
  // someone who pinched out to look around is not yanked back every second.
  const centred = useRef(false);
  const lastRecenter = useRef(recenterKey);
  useEffect(() => {
    if (!follow || !here) return;
    const snap = !centred.current || lastRecenter.current !== recenterKey;
    centred.current = true;
    lastRecenter.current = recenterKey;
    camera.current?.easeTo({
      center: [here.lon, here.lat],
      padding: { bottom: bottomInset },
      ...(snap ? { zoom: 16 } : {}),
      duration: snap ? 0 : 600,
    });
  }, [follow, here, bottomInset, recenterKey]);

  useEffect(() => {
    if (follow || !bounds) return;
    camera.current?.fitBounds(bounds, {
      padding: { top: 40, right: 40, bottom: 40 + bottomInset, left: 40 },
      duration: 0,
    });
  }, [follow, bounds, bottomInset]);

  const start = here ?? (last ? { lat: last.lat, lon: last.lon } : null);

  if (failed)
    return <RouteGrid fixes={fixes} here={here} showEnds={showEnds} dotColour={dotColour} lineColour={lineColour} />;
  // Nothing to centre on yet: wait for the first fix rather than open on a
  // map of the whole world and swoop in.
  if (follow && !start) return <RouteGrid fixes={[]} here={null} message="Finding your position…" />;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={mapStyleUrl(styleId)}
        onDidFailLoadingMap={() => setFailed(true)}
        logo={false}
        attribution={false}
        compass={false}
        touchPitch={false}
      >
        <Camera
          ref={camera}
          initialViewState={
            !follow && bounds
              ? { bounds, padding: { top: 40, right: 40, bottom: 40 + bottomInset, left: 40 } }
              : start
                ? { center: [start.lon, start.lat], zoom: 16 }
                : { center: [0, 20], zoom: 1 }
          }
        />
        <GeoJSONSource id="route" data={route}>
          <Layer
            id="route-casing"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': casingFor(lineColour), 'line-width': 7, 'line-opacity': 0.85 }}
          />
          <Layer
            id="route-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': lineColour, 'line-width': 4.5 }}
          />
        </GeoJSONSource>
        {showEnds && first ? (
          <GeoJSONSource id="start" data={pointGeoJson(first)}>
            <Layer
              id="start-dot"
              type="circle"
              paint={{
                'circle-radius': 6,
                'circle-color': casingFor(lineColour),
                'circle-stroke-color': lineColour,
                'circle-stroke-width': 3,
              }}
            />
          </GeoJSONSource>
        ) : null}
        {here || (showEnds && last) ? (
          <GeoJSONSource id="here" data={pointGeoJson(here ?? last!)}>
            <Layer
              id="here-dot"
              type="circle"
              paint={{
                'circle-radius': 8,
                'circle-color': dotColour,
                'circle-stroke-color': casingFor(dotColour),
                'circle-stroke-width': 3,
              }}
            />
          </GeoJSONSource>
        ) : null}
      </Map>
      <Text style={[styles.attribution, { bottom: bottomInset + 4 }]}>{MAP_ATTRIBUTION}</Text>
    </View>
  );
}

/** The offline stand-in: the same blue route and dot on a dark grid. */
export function RouteGrid({
  fixes,
  here,
  showEnds,
  message = 'Map needs signal — your route is still recording',
  dotColour = MAP_ROUTE_BLUE,
  lineColour = MAP_ROUTE_BLUE,
}: {
  fixes: readonly Fix[];
  here: Here | null;
  showEnds?: boolean;
  message?: string;
  dotColour?: string;
  lineColour?: string;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const { project } = projectToBox(fixes, size.w, size.h, 40, here);
  const segments = new globalThis.Map<number, Fix[]>();
  for (const f of fixes) segments.set(f.segment, [...(segments.get(f.segment) ?? []), f]);
  const dot = here ?? (showEnds ? fixes[fixes.length - 1] : null);
  const step = 32;

  return (
    <View style={[StyleSheet.absoluteFill, styles.grid]} onLayout={onLayout}>
      {size.w > 0 ? (
        <Svg width={size.w} height={size.h}>
          {Array.from({ length: Math.ceil(size.w / step) }, (_, i) => (
            <Line key={`v${i}`} x1={i * step} y1={0} x2={i * step} y2={size.h} stroke={colors.border} strokeWidth={1} />
          ))}
          {Array.from({ length: Math.ceil(size.h / step) }, (_, i) => (
            <Line key={`h${i}`} x1={0} y1={i * step} x2={size.w} y2={i * step} stroke={colors.border} strokeWidth={1} />
          ))}
          {[...segments.values()].map((seg, i) => {
            const pts = seg.map(project).map((p) => `${p.x},${p.y}`).join(' ');
            return (
              <React.Fragment key={i}>
                <Polyline points={pts} fill="none" stroke={casingFor(lineColour)} strokeOpacity={0.85} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
                <Polyline points={pts} fill="none" stroke={lineColour} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
              </React.Fragment>
            );
          })}
          {showEnds && fixes[0] ? (
            <Circle {...xy(project(fixes[0]))} r={6} fill={casingFor(lineColour)} stroke={lineColour} strokeWidth={3} />
          ) : null}
          {dot ? <Circle {...xy(project(dot))} r={8} fill={dotColour} stroke={casingFor(dotColour)} strokeWidth={3} /> : null}
        </Svg>
      ) : null}
      <Text style={styles.offline}>{message}</Text>
    </View>
  );
}

const xy = (p: { x: number; y: number }) => ({ cx: p.x, cy: p.y });

const styles = themedStyles(() =>
  StyleSheet.create({
    grid: { backgroundColor: colors.bg },
    offline: {
      position: 'absolute',
      top: 12,
      alignSelf: 'center',
      color: colors.textMuted,
      fontSize: 12,
      backgroundColor: colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      overflow: 'hidden',
      fontFamily: fonts.body,
    },
    attribution: {
      position: 'absolute',
      right: 6,
      fontSize: 9,
      color: '#333333',
      backgroundColor: 'rgba(255,255,255,0.7)',
      paddingHorizontal: 4,
      borderRadius: 3,
      overflow: 'hidden',
    },
  })
);
