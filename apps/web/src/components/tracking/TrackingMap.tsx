import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Navigation,
  Compass,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Layers,
} from 'lucide-react';

export interface TrackingMapProps {
  rideId?: string;
  routeGeometry?: Array<[number, number]>; // Array of [lat, lng]
  driverLocation?: {
    latitude: number;
    longitude: number;
    heading?: number | null;
    accuracy?: number | null;
    speedKmh?: number | null;
  } | null;
  origin?: {
    latitude?: number | null;
    longitude?: number | null;
    label: string;
  };
  destination?: {
    latitude?: number | null;
    longitude?: number | null;
    label: string;
  };
  myPickup?: {
    latitude?: number | null;
    longitude?: number | null;
    label?: string | null;
  } | null;
  otherPickups?: Array<{
    latitude: number;
    longitude: number;
    label: string;
    boardingStatus: string;
  }>;
  isStale?: boolean;
  className?: string;
}

function hasValidCoords<T extends { latitude?: number | null; longitude?: number | null } | null | undefined>(
  loc: T
): loc is T & { latitude: number; longitude: number } {
  return (
    typeof loc?.latitude === 'number' &&
    typeof loc?.longitude === 'number' &&
    !isNaN(loc.latitude) &&
    !isNaN(loc.longitude) &&
    loc.latitude >= -90 &&
    loc.latitude <= 90 &&
    loc.longitude >= -180 &&
    loc.longitude <= 180 &&
    !(loc.latitude === 0 && loc.longitude === 0)
  );
}

/**
 * Calculates the shortest signed angle between two bearings in degrees (-180 to +180).
 */
function getShortestAngleDelta(fromAngle: number, toAngle: number): number {
  let diff = (toAngle - fromAngle) % 360;
  if (diff < -180) diff += 360;
  if (diff > 180) diff -= 360;
  return diff;
}

/**
 * Cubic easing out for ultra-smooth vehicular deceleration.
 */
function easeOutCubic(t: number): number {
  const p = t - 1;
  return p * p * p + 1;
}

/**
 * Classy, executive top-down sports sedan SVG asset (Porsche / Audi e-tron aesthetic)
 * Featuring metallic obsidian lacquer, sculpted aero curves, xenon light beams, and continuous rear LED lightbar.
 */
function renderTopDownCarSvg(isStale: boolean): string {
  const beamColor = isStale ? '#f59e0b' : '#38bdf8';
  return `
    <svg width="44" height="76" viewBox="0 0 44 76" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 10px 22px rgba(0,0,0,0.55));">
      <defs>
        <linearGradient id="bodyLacquer" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#0b0f19" />
          <stop offset="20%" stop-color="#1e293b" />
          <stop offset="45%" stop-color="#334155" />
          <stop offset="55%" stop-color="#1e293b" />
          <stop offset="80%" stop-color="#334155" />
          <stop offset="100%" stop-color="#0b0f19" />
        </linearGradient>

        <linearGradient id="glassCanopy" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#020617" stop-opacity="0.95" />
          <stop offset="35%" stop-color="#0f172a" stop-opacity="0.85" />
          <stop offset="70%" stop-color="#1e293b" stop-opacity="0.8" />
          <stop offset="100%" stop-color="#020617" stop-opacity="0.95" />
        </linearGradient>

        <linearGradient id="specularSheen" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="rgba(255,255,255,0.45)" />
          <stop offset="50%" stop-color="rgba(255,255,255,0.05)" />
          <stop offset="100%" stop-color="rgba(255,255,255,0)" />
        </linearGradient>

        <linearGradient id="headlightBeam" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stop-color="${beamColor}" stop-opacity="0.75" />
          <stop offset="70%" stop-color="${beamColor}" stop-opacity="0.2" />
          <stop offset="100%" stop-color="${beamColor}" stop-opacity="0" />
        </linearGradient>
      </defs>

      <!-- Forward High-Intensity Projection Light Beams -->
      <polygon points="11,18 2,0 18,0" fill="url(#headlightBeam)" opacity="0.8" />
      <polygon points="33,18 26,0 42,0" fill="url(#headlightBeam)" opacity="0.8" />

      <!-- Performance Low-Profile Wheels -->
      <rect x="3" y="20" width="4" height="10" rx="1.5" fill="#020617" />
      <rect x="37" y="20" width="4" height="10" rx="1.5" fill="#020617" />
      <rect x="3" y="50" width="4" height="10" rx="1.5" fill="#020617" />
      <rect x="37" y="50" width="4" height="10" rx="1.5" fill="#020617" />

      <!-- Sculpted Aerodynamic Monocoque Body -->
      <path d="M14 13 C17 11.5, 27 11.5, 30 13 C33 15, 36.5 19, 36.5 28 C37 36, 35.5 44, 37 53 C37.5 59, 34.5 65.5, 31 66.5 C28 67.5, 16 67.5, 13 66.5 C9.5 65.5, 6.5 59, 7 53 C8.5 44, 7 36, 7.5 28 C7.5 19, 11 15, 14 13 Z" fill="url(#bodyLacquer)" stroke="#475569" stroke-width="0.8" />

      <!-- High-Gloss Hood Creases -->
      <path d="M15 14 L17.5 24 M29 14 L26.5 24" stroke="rgba(255,255,255,0.35)" stroke-width="0.8" stroke-linecap="round" />
      <path d="M22 13 L22 23" stroke="rgba(255,255,255,0.18)" stroke-width="0.6" stroke-linecap="round" />

      <!-- Aerodynamic Side Mirrors with Chrome Turn Indicators -->
      <path d="M6.5 28 C3.5 28, 2.5 31, 5.5 33 L7.5 33 Z" fill="#1e293b" stroke="#64748b" stroke-width="0.5" />
      <line x1="4" y1="29.5" x2="6" y2="31" stroke="#f8fafc" stroke-width="0.7" stroke-linecap="round" />

      <path d="M37.5 28 C40.5 28, 41.5 31, 38.5 33 L36.5 33 Z" fill="#1e293b" stroke="#64748b" stroke-width="0.5" />
      <line x1="40" y1="29.5" x2="38" y2="31" stroke="#f8fafc" stroke-width="0.7" stroke-linecap="round" />

      <!-- Panoramic Dark Tint Glasshouse Canopy -->
      <path d="M12.5 27 C15 25, 29 25, 31.5 27 L32.5 48 C30 50.5, 14 50.5, 11.5 48 Z" fill="url(#glassCanopy)" stroke="#090d16" stroke-width="0.6" />

      <!-- Specular Glass Highlight Glazing -->
      <path d="M13.5 27.5 L24 27.5 L17 48 L12.5 47 Z" fill="url(#specularSheen)" opacity="0.6" />

      <!-- Tinted Sunroof Glass -->
      <rect x="15" y="32" width="14" height="12" rx="1.5" fill="#020617" stroke="rgba(56,189,248,0.4)" stroke-width="0.6" />

      <!-- Dual Xenon LED Headlight Blades -->
      <path d="M11.5 15.5 L16.5 14" stroke="#e0f2fe" stroke-width="2.2" stroke-linecap="round" style="filter: drop-shadow(0 0 3px #38bdf8);" />
      <path d="M32.5 15.5 L27.5 14" stroke="#e0f2fe" stroke-width="2.2" stroke-linecap="round" style="filter: drop-shadow(0 0 3px #38bdf8);" />

      <!-- Continuous Precision Red Neon LED Taillight Bar -->
      <path d="M12 65 C17 66, 27 66, 32 65" stroke="#ef4444" stroke-width="2.4" stroke-linecap="round" style="filter: drop-shadow(0 0 4px #ef4444);" />
      <circle cx="12.5" cy="65" r="1" fill="#ff8888" />
      <circle cx="31.5" cy="65" r="1" fill="#ff8888" />
    </svg>
  `;
}

export const TrackingMap: React.FC<TrackingMapProps> = ({
  rideId,
  routeGeometry,
  driverLocation,
  origin,
  destination,
  myPickup,
  otherPickups = [],
  isStale = false,
  className = '',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Layer & Marker Refs
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const corridorLayerRef = useRef<L.LayerGroup | null>(null);
  const routeGlowRef = useRef<L.Polyline | null>(null);
  const routeCasingRef = useRef<L.Polyline | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);

  // Road Curve State
  const [roadCoordinates, setRoadCoordinates] = useState<Array<[number, number]>>([]);

  // Smooth 60fps Animation Refs
  const animStateRef = useRef<{
    startLat: number;
    startLng: number;
    targetLat: number;
    targetLng: number;
    startHeading: number;
    targetHeading: number;
    headingDelta: number;
    startTime: number;
    duration: number;
    currentLat: number;
    currentLng: number;
    currentHeading: number;
    isInitialized: boolean;
  }>({
    startLat: 0,
    startLng: 0,
    targetLat: 0,
    targetLng: 0,
    startHeading: 0,
    targetHeading: 0,
    headingDelta: 0,
    startTime: 0,
    duration: 1600,
    currentLat: 0,
    currentLng: 0,
    currentHeading: 0,
    isInitialized: false,
  });
  const rafIdRef = useRef<number | null>(null);

  // Framing & Navigation state
  const isUserPannedRef = useRef<boolean>(false);
  const [isUserInteracting, setIsUserInteracting] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [showLegend, setShowLegend] = useState<boolean>(true);
  const initialFitDoneRef = useRef<boolean>(false);

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Fetch Real Road Network Geometry (OSRM / Backend)
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let isCancelled = false;

    // Use passed prop if available
    if (routeGeometry && routeGeometry.length > 1) {
      setRoadCoordinates(routeGeometry);
      return;
    }

    if (!hasValidCoords(origin) || !hasValidCoords(destination)) return;

    const fetchRoadRoute = async () => {
      // Priority 1: Backend stored route geometry if rideId provided
      if (rideId) {
        try {
          const token = localStorage.getItem('vit_auth_token');
          const res = await fetch(`/api/rides/${rideId}/route`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.geometry?.coordinates && Array.isArray(data.geometry.coordinates)) {
              // Convert [lng, lat] GeoJSON to [lat, lng] Leaflet
              const latLngs: Array<[number, number]> = data.geometry.coordinates.map(
                ([lng, lat]: [number, number]) => [lat, lng]
              );
              if (!isCancelled && latLngs.length > 1) {
                setRoadCoordinates(latLngs);
                return;
              }
            }
          }
        } catch {
          // Fall back to direct road routing
        }
      }

      // Priority 2: Direct OpenStreetMap OSRM Driving Road Routing (Routing via Origin -> Pickup -> Destination)
      try {
        const waypointParts: string[] = [`${origin.longitude},${origin.latitude}`];
        if (hasValidCoords(myPickup)) {
          waypointParts.push(`${myPickup.longitude},${myPickup.latitude}`);
        }
        waypointParts.push(`${destination.longitude},${destination.latitude}`);

        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${waypointParts.join(';')}?overview=full&geometries=geojson`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(osrmUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          const coords = data?.routes?.[0]?.geometry?.coordinates;
          if (Array.isArray(coords) && coords.length > 1) {
            const latLngs: Array<[number, number]> = coords.map(([lng, lat]: [number, number]) => [
              lat,
              lng,
            ]);
            if (!isCancelled) {
              setRoadCoordinates(latLngs);
              return;
            }
          }
        }
      } catch {
        // Fall back to straight landmark connection if offline
      }
    };

    fetchRoadRoute();
    return () => {
      isCancelled = true;
    };
  }, [
    rideId,
    routeGeometry,
    origin?.latitude,
    origin?.longitude,
    destination?.latitude,
    destination?.longitude,
    myPickup?.latitude,
    myPickup?.longitude,
  ]);

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Initialize Map with Modern Clean Mobility Tiles (CartoDB Voyager)
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const defaultLat = hasValidCoords(driverLocation)
      ? driverLocation.latitude
      : hasValidCoords(origin)
      ? origin.latitude
      : 12.8406;

    const defaultLng = hasValidCoords(driverLocation)
      ? driverLocation.longitude
      : hasValidCoords(origin)
      ? origin.longitude
      : 80.1534;

    const map = L.map(mapContainerRef.current, {
      center: [defaultLat, defaultLng],
      zoom: 14,
      minZoom: 10,
      maxZoom: 19,
      zoomControl: false,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      touchZoom: true,
      dragging: true,
      attributionControl: false,
    });

    // Clean, high-contrast mobility basemap: OpenStreetMap Humanitarian (HOT)
    // 100% free, zero watermark, transit-optimized road hierarchy
    const mobilityTiles = L.tileLayer(
      'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
      {
        subdomains: 'abc',
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      }
    );

    // Resilient fallback to OpenStreetMap Standard if HOT experiences network issues
    mobilityTiles.on('tileerror', () => {
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      }).addTo(map);
    });

    mobilityTiles.addTo(map);

    L.control
      .attribution({ position: 'bottomright', prefix: false })
      .addTo(map);

    corridorLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const handleUserInteraction = (e: L.LeafletEvent) => {
      if (e.type === 'dragstart' || (e as any).originalEvent) {
        isUserPannedRef.current = true;
        setIsUserInteracting(true);
      }
    };

    map.on('dragstart', handleUserInteraction);
    map.on('zoomstart', handleUserInteraction);

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }
    setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      resizeObserver.disconnect();
      map.off('dragstart', handleUserInteraction);
      map.off('zoomstart', handleUserInteraction);
      map.remove();
      mapRef.current = null;
      driverMarkerRef.current = null;
      accuracyCircleRef.current = null;
      routeGlowRef.current = null;
      routeCasingRef.current = null;
      routeLineRef.current = null;
      corridorLayerRef.current = null;
      initialFitDoneRef.current = false;
      animStateRef.current.isInitialized = false;
    };
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Render Curved Road Network Corridor Elements & Pins
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const corridorLayer = corridorLayerRef.current;
    if (!map || !corridorLayer) return;

    corridorLayer.clearLayers();
    const corridorPoints: L.LatLngExpression[] = [];

    // 1. Origin Marker (A Pin)
    if (hasValidCoords(origin)) {
      const originIcon = L.divIcon({
        className: 'custom-map-icon',
        html: `
          <div style="
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: #ffffff;
            padding: 5px 12px 5px 7px;
            border-radius: 24px;
            border: 2px solid #2563eb;
            box-shadow: 0 4px 16px rgba(37,99,235,0.28);
            font-family: inherit;
            cursor: pointer;
            z-index: 50;
          ">
            <div style="
              background: #2563eb;
              color: white;
              border-radius: 50%;
              width: 22px;
              height: 22px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 11px;
              font-weight: 800;
            ">A</div>
            <span style="font-size: 11px; font-weight: 700; color: #0f172a; white-space: nowrap;">Origin</span>
          </div>
        `,
        iconSize: [84, 32],
        iconAnchor: [42, 16],
      });

      L.marker([origin.latitude, origin.longitude], { icon: originIcon, zIndexOffset: 500 })
        .bindPopup(`<b>Ride Origin:</b><br/>${origin.label || 'Origin Stop'}`)
        .addTo(corridorLayer);
      corridorPoints.push([origin.latitude, origin.longitude]);
    }

    // 2. Destination Marker (🏁 Flag Pin)
    if (hasValidCoords(destination)) {
      const destIcon = L.divIcon({
        className: 'custom-map-icon',
        html: `
          <div style="
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: #0f172a;
            padding: 5px 12px 5px 7px;
            border-radius: 24px;
            border: 2px solid #ffffff;
            box-shadow: 0 4px 16px rgba(15,23,42,0.4);
            color: #ffffff;
            font-family: inherit;
            cursor: pointer;
            z-index: 50;
          ">
            <div style="
              background: #ef4444;
              color: white;
              border-radius: 50%;
              width: 22px;
              height: 22px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 11px;
            ">
              <span id="destination-marker">🏁</span>
            </div>
            <span style="font-size: 11px; font-weight: 700; white-space: nowrap;">Destination</span>
          </div>
        `,
        iconSize: [115, 32],
        iconAnchor: [57, 16],
      });

      L.marker([destination.latitude, destination.longitude], { icon: destIcon, zIndexOffset: 500 })
        .bindPopup(`<b>Final Destination:</b><br/>${destination.label || 'Campus Destination'}`)
        .addTo(corridorLayer);
      corridorPoints.push([destination.latitude, destination.longitude]);
    }

    // 3. User's Own Designated Pickup Marker with Pulsing Beacon Ring
    if (hasValidCoords(myPickup)) {
      const pickupIcon = L.divIcon({
        className: 'custom-map-icon',
        html: `
          <div style="position: relative; display: inline-flex; align-items: center; justify-content: center;">
            <div style="
              position: absolute;
              width: 52px;
              height: 52px;
              border-radius: 50%;
              background: rgba(5, 150, 105, 0.28);
              animation: pickup-radar-pulse 2.2s infinite ease-out;
              pointer-events: none;
            "></div>
            <div id="my-pickup-marker" style="
              position: relative;
              display: inline-flex;
              align-items: center;
              gap: 6px;
              background: #059669;
              color: white;
              border-radius: 24px;
              padding: 5px 14px 5px 9px;
              font-size: 11px;
              font-weight: 700;
              white-space: nowrap;
              box-shadow: 0 4px 16px rgba(5,150,105,0.48);
              border: 2px solid white;
              font-family: inherit;
              cursor: pointer;
              z-index: 60;
            ">
              <span>📍 Your Pickup</span>
            </div>
          </div>
        `,
        iconSize: [126, 38],
        iconAnchor: [63, 19],
      });

      L.marker([myPickup.latitude, myPickup.longitude], { icon: pickupIcon, zIndexOffset: 600 })
        .bindPopup(`<b>Your Pickup Point:</b><br/>${myPickup.label || 'Designated Stop'}`)
        .addTo(corridorLayer);
      corridorPoints.push([myPickup.latitude, myPickup.longitude]);
    }

    // 4. Other Passenger Pickups
    otherPickups.forEach((p) => {
      if (hasValidCoords(p)) {
        const isBoarded = p.boardingStatus === 'BOARDED';
        const bgColor = isBoarded ? '#10b981' : '#f59e0b';
        const icon = L.divIcon({
          className: 'custom-map-icon',
          html: `
            <div style="
              background: ${bgColor};
              color: white;
              border-radius: 50%;
              width: 30px;
              height: 30px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 11px;
              font-weight: 800;
              box-shadow: 0 4px 10px rgba(0,0,0,0.28);
              border: 2px solid white;
            ">${p.label.substring(0, 2).toUpperCase()}</div>
          `,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });

        L.marker([p.latitude, p.longitude], { icon, zIndexOffset: 400 })
          .bindPopup(`<b>Passenger Stop:</b><br/>${p.label} (${p.boardingStatus})`)
          .addTo(corridorLayer);
        corridorPoints.push([p.latitude, p.longitude]);
      }
    });

    // 5. Dual-Layer Curved Road Polyline (Hugs Highway Curves)
    const polylineCoords: L.LatLngExpression[] =
      roadCoordinates.length > 1
        ? roadCoordinates
        : [
            ...(hasValidCoords(origin) ? [[origin.latitude, origin.longitude] as [number, number]] : []),
            ...(hasValidCoords(myPickup) ? [[myPickup.latitude, myPickup.longitude] as [number, number]] : []),
            ...otherPickups.filter(hasValidCoords).map((p) => [p.latitude, p.longitude] as [number, number]),
            ...(hasValidCoords(destination) ? [[destination.latitude, destination.longitude] as [number, number]] : []),
          ];

    if (polylineCoords.length >= 2) {
      if (routeGlowRef.current) {
        try { routeGlowRef.current.remove(); } catch {}
      }
      if (routeCasingRef.current) {
        try { routeCasingRef.current.remove(); } catch {}
      }
      if (routeLineRef.current) {
        try { routeLineRef.current.remove(); } catch {}
      }

      // Layer 1: Soft ambient neon glow on road
      routeGlowRef.current = L.polyline(polylineCoords, {
        color: '#38bdf8',
        weight: 12,
        opacity: 0.22,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(corridorLayer);

      // Layer 2: Deep high-contrast obsidian casing
      routeCasingRef.current = L.polyline(polylineCoords, {
        color: '#0f172a',
        weight: 7,
        opacity: 0.65,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(corridorLayer);

      // Layer 3: Vibrant high-definition sapphire navigation ribbon
      routeLineRef.current = L.polyline(polylineCoords, {
        color: '#2563eb',
        weight: 4.5,
        opacity: 1.0,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(corridorLayer);
    }

    // Initial Bounds Framing
    if (!initialFitDoneRef.current && corridorPoints.length > 0) {
      if (hasValidCoords(driverLocation)) {
        corridorPoints.push([driverLocation.latitude, driverLocation.longitude]);
      }
      map.invalidateSize();
      if (corridorPoints.length >= 2) {
        map.fitBounds(L.latLngBounds(corridorPoints), { padding: [50, 50], maxZoom: 15 });
      } else {
        map.setView(corridorPoints[0], 14);
      }
      initialFitDoneRef.current = true;
    }
  }, [origin, destination, myPickup, otherPickups, roadCoordinates]);

  // ───────────────────────────────────────────────────────────────────────────
  // 4. 60 FPS Gliding Interpolation & Shortest-Arc Steering Engine
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!hasValidCoords(driverLocation)) {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (driverMarkerRef.current) {
        try { driverMarkerRef.current.remove(); } catch {}
        driverMarkerRef.current = null;
      }
      if (accuracyCircleRef.current) {
        try { accuracyCircleRef.current.remove(); } catch {}
        accuracyCircleRef.current = null;
      }
      animStateRef.current.isInitialized = false;
      return;
    }

    const { latitude, longitude, heading, accuracy, speedKmh } = driverLocation;
    const targetHeading = typeof heading === 'number' && !isNaN(heading) ? (heading + 360) % 360 : 0;
    const speedDisplay = typeof speedKmh === 'number' && speedKmh > 0 ? `${Math.round(speedKmh)} km/h` : null;

    const buildDriverIconHtml = (currHeading: number) => `
      <div id="${isStale ? 'driver-marker-stale' : 'driver-marker'}" style="position: relative; width: 72px; height: 94px; display: flex; align-items: center; justify-content: center; pointer-events: auto;">
        ${
          !isStale
            ? `<div style="
                position: absolute;
                width: 68px;
                height: 68px;
                border-radius: 50%;
                background: rgba(56, 189, 248, 0.18);
                animation: driver-radar-pulse 2.2s infinite ease-out;
                pointer-events: none;
              "></div>`
            : ''
        }

        <!-- Rotating Top-Down Luxury Vehicle Container -->
        <div class="car-rotator" style="
          width: 44px;
          height: 76px;
          display: flex;
          align-items: center;
          justify-content: center;
          transform: rotate(${currHeading}deg);
          transform-origin: center center;
          transition: transform 0.08s linear;
          z-index: 1000;
        ">
          ${renderTopDownCarSvg(isStale)}
        </div>

        <!-- Floating Upright Speed / Status Glass Badge -->
        <div style="
          position: absolute;
          bottom: -4px;
          background: rgba(15, 23, 42, 0.92);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          color: #ffffff;
          font-size: 10px;
          font-weight: 700;
          padding: 3px 9px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
          white-space: nowrap;
          z-index: 1010;
          letter-spacing: 0.2px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
        ">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: ${isStale ? '#f59e0b' : '#10b981'}; box-shadow: 0 0 6px ${isStale ? '#f59e0b' : '#10b981'};"></span>
          <span>${speedDisplay ? `${isStale ? 'Stale • ' : ''}${speedDisplay}` : isStale ? 'Reconnecting' : 'Live'}</span>
        </div>
      </div>
    `;

    const driverIcon = L.divIcon({
      className: 'custom-driver-marker-icon custom-driver-icon',
      html: buildDriverIconHtml(targetHeading),
      iconSize: [72, 94],
      iconAnchor: [36, 47],
    });

    // Case A: First location arrival
    if (!animStateRef.current.isInitialized || !driverMarkerRef.current || !map.hasLayer(driverMarkerRef.current)) {
      if (driverMarkerRef.current) {
        try { driverMarkerRef.current.remove(); } catch {}
      }

      driverMarkerRef.current = L.marker([latitude, longitude], {
        icon: driverIcon,
        zIndexOffset: 2000,
      }).addTo(map);

      driverMarkerRef.current.bindPopup(
        `<b>Driver Location</b><br/>${isStale ? '<span style="color:#ea580c">⚠️ Signal Stale</span>' : '<span style="color:#059669">🟢 Live Tracking</span>'}${speedDisplay ? `<br/>Speed: ${speedDisplay}` : ''}`
      );

      animStateRef.current = {
        startLat: latitude,
        startLng: longitude,
        targetLat: latitude,
        targetLng: longitude,
        startHeading: targetHeading,
        targetHeading: targetHeading,
        headingDelta: 0,
        startTime: performance.now(),
        duration: 1600,
        currentLat: latitude,
        currentLng: longitude,
        currentHeading: targetHeading,
        isInitialized: true,
      };

      if (!isUserPannedRef.current) {
        map.setView([latitude, longitude], 15, { animate: true });
      }
      return;
    }

    // Case B: Marker exists -> 60fps Interpolation
    driverMarkerRef.current.setIcon(driverIcon);
    driverMarkerRef.current.setPopupContent(
      `<b>Driver Location</b><br/>${isStale ? '<span style="color:#ea580c">⚠️ Signal Stale</span>' : '<span style="color:#059669">🟢 Live Tracking</span>'}${speedDisplay ? `<br/>Speed: ${speedDisplay}` : ''}`
    );

    const prevLat = animStateRef.current.currentLat;
    const prevLng = animStateRef.current.currentLng;
    const prevHeading = animStateRef.current.currentHeading;

    const headingDelta = getShortestAngleDelta(prevHeading, targetHeading);

    animStateRef.current.startLat = prevLat;
    animStateRef.current.startLng = prevLng;
    animStateRef.current.targetLat = latitude;
    animStateRef.current.targetLng = longitude;
    animStateRef.current.startHeading = prevHeading;
    animStateRef.current.targetHeading = targetHeading;
    animStateRef.current.headingDelta = headingDelta;
    animStateRef.current.startTime = performance.now();
    animStateRef.current.duration = 1800;

    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
    }

    const animateFrame = (now: number) => {
      const {
        startLat,
        startLng,
        targetLat,
        targetLng,
        startHeading,
        headingDelta,
        startTime,
        duration,
      } = animStateRef.current;

      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedT = easeOutCubic(progress);

      const interpolatedLat = startLat + (targetLat - startLat) * easedT;
      const interpolatedLng = startLng + (targetLng - startLng) * easedT;
      const interpolatedHeading = (startHeading + headingDelta * easedT + 360) % 360;

      animStateRef.current.currentLat = interpolatedLat;
      animStateRef.current.currentLng = interpolatedLng;
      animStateRef.current.currentHeading = interpolatedHeading;

      // Update marker coordinates
      if (driverMarkerRef.current) {
        driverMarkerRef.current.setLatLng([interpolatedLat, interpolatedLng]);
      }

      // Rotate car chassis via DOM
      const markerEl = document.getElementById(isStale ? 'driver-marker-stale' : 'driver-marker');
      if (markerEl) {
        const rotator = markerEl.querySelector('.car-rotator') as HTMLElement;
        if (rotator) {
          rotator.style.transform = `rotate(${interpolatedHeading}deg)`;
        }
      }

      // Update accuracy circle
      if (accuracyCircleRef.current) {
        accuracyCircleRef.current.setLatLng([interpolatedLat, interpolatedLng]);
      }

      // Smooth camera auto-follow
      if (!isUserPannedRef.current && mapRef.current) {
        mapRef.current.panTo([interpolatedLat, interpolatedLng], { animate: false });
      }

      if (progress < 1) {
        rafIdRef.current = requestAnimationFrame(animateFrame);
      } else {
        rafIdRef.current = null;
      }
    };

    rafIdRef.current = requestAnimationFrame(animateFrame);

    // Accuracy Circle
    if (accuracy && accuracy > 0 && accuracy < 600) {
      if (!accuracyCircleRef.current || !map.hasLayer(accuracyCircleRef.current)) {
        if (accuracyCircleRef.current) {
          try { accuracyCircleRef.current.remove(); } catch {}
        }
        accuracyCircleRef.current = L.circle([latitude, longitude], {
          radius: accuracy,
          color: isStale ? '#ea580c' : '#059669',
          dashArray: isStale ? '4, 6' : undefined,
          fillColor: isStale ? '#ea580c' : '#059669',
          fillOpacity: 0.07,
          weight: 1,
        }).addTo(map);
      } else {
        accuracyCircleRef.current.setRadius(accuracy);
        accuracyCircleRef.current.setStyle({
          color: isStale ? '#ea580c' : '#059669',
          dashArray: isStale ? '4, 6' : undefined,
          fillColor: isStale ? '#ea580c' : '#059669',
        });
      }
    } else if (accuracyCircleRef.current) {
      try { accuracyCircleRef.current.remove(); } catch {}
      accuracyCircleRef.current = null;
    }
  }, [driverLocation, isStale]);

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Interactive Map Actions
  // ───────────────────────────────────────────────────────────────────────────
  const handleRecenterDriver = useCallback(() => {
    if (!mapRef.current) return;
    if (hasValidCoords(driverLocation)) {
      isUserPannedRef.current = false;
      setIsUserInteracting(false);
      const targetLat = animStateRef.current.isInitialized
        ? animStateRef.current.currentLat
        : driverLocation.latitude;
      const targetLng = animStateRef.current.isInitialized
        ? animStateRef.current.currentLng
        : driverLocation.longitude;
      mapRef.current.setView([targetLat, targetLng], 15, {
        animate: true,
      });
    }
  }, [driverLocation]);

  const handleFitCorridor = useCallback(() => {
    if (!mapRef.current) return;
    const points: L.LatLngExpression[] = [];
    if (hasValidCoords(driverLocation)) {
      points.push([driverLocation.latitude, driverLocation.longitude]);
    }
    if (hasValidCoords(origin)) {
      points.push([origin.latitude, origin.longitude]);
    }
    if (hasValidCoords(destination)) {
      points.push([destination.latitude, destination.longitude]);
    }
    if (hasValidCoords(myPickup)) {
      points.push([myPickup.latitude, myPickup.longitude]);
    }
    otherPickups.forEach((p) => {
      if (hasValidCoords(p)) {
        points.push([p.latitude, p.longitude]);
      }
    });

    if (points.length >= 2) {
      mapRef.current.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 15 });
    } else if (points.length === 1) {
      mapRef.current.setView(points[0], 14);
    }
  }, [driverLocation, origin, destination, myPickup, otherPickups]);

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();

  return (
    <div
      id="tracking-map-container"
      className={`tracking-map-container ${isExpanded ? 'tracking-map-expanded' : ''} ${className}`}
      style={{
        position: isExpanded ? 'fixed' : 'relative',
        top: isExpanded ? 0 : 'auto',
        left: isExpanded ? 0 : 'auto',
        right: isExpanded ? 0 : 'auto',
        bottom: isExpanded ? 0 : 'auto',
        width: '100%',
        height: isExpanded ? '100vh' : '480px',
        zIndex: isExpanded ? 9999 : 1,
        borderRadius: isExpanded ? '0' : '16px',
        overflow: 'hidden',
        border: isExpanded ? 'none' : '1px solid rgba(226, 232, 240, 0.9)',
        boxShadow: isExpanded ? 'none' : '0 8px 24px rgba(15,23,42,0.08)',
        backgroundColor: '#f8fafc',
      }}
    >
      <style>{`
        @keyframes driver-radar-pulse {
          0% { transform: scale(0.6); opacity: 0.85; }
          70% { transform: scale(1.6); opacity: 0.15; }
          100% { transform: scale(2.0); opacity: 0; }
        }
        @keyframes pickup-radar-pulse {
          0% { transform: scale(0.5); opacity: 0.9; }
          65% { transform: scale(1.7); opacity: 0.2; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        .leaflet-container {
          width: 100%;
          height: 100%;
          font-family: inherit;
          touch-action: pan-x pan-y;
        }
        .custom-driver-marker-icon {
          will-change: transform;
        }
        .map-floating-btn {
          background: rgba(255, 255, 255, 0.92);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: #1e293b;
          border: 1px solid rgba(226, 232, 240, 0.9);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(0,0,0,0.08);
          transition: all 0.15s ease;
          min-width: 40px;
          min-height: 40px;
        }
        .map-floating-btn:hover {
          background: #ffffff;
          border-color: #cbd5e1;
          box-shadow: 0 6px 18px rgba(0,0,0,0.12);
          transform: translateY(-1px);
        }
        .map-floating-btn:active {
          transform: scale(0.96);
        }
      `}</style>

      {/* Map DOM Element */}
      <div
        ref={mapContainerRef}
        data-testid="interactive-leaflet-map"
        style={{ width: '100%', height: '100%' }}
      />

      {/* Top Floating Glass Navigation Header */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          padding: '6px 14px',
          borderRadius: '24px',
          border: '1px solid rgba(226, 232, 240, 0.9)',
          boxShadow: '0 4px 16px rgba(15,23,42,0.08)',
          fontSize: '12px',
          fontWeight: 700,
          color: '#0f172a',
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: isStale ? '#ea580c' : '#10b981',
            boxShadow: `0 0 0 3px ${isStale ? 'rgba(234,88,12,0.2)' : 'rgba(16,185,129,0.2)'}`,
          }}
        />
        <span>{isStale ? 'Signal Stale • Reconnecting' : 'Live Campus Transit Corridor'}</span>
      </div>

      {/* Top-Right Floating Controls */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <button
          type="button"
          id="btn-map-zoom-in"
          className="map-floating-btn"
          onClick={handleZoomIn}
          aria-label="Zoom in"
          title="Zoom In"
        >
          <ZoomIn size={18} />
        </button>
        <button
          type="button"
          id="btn-map-zoom-out"
          className="map-floating-btn"
          onClick={handleZoomOut}
          aria-label="Zoom out"
          title="Zoom Out"
        >
          <ZoomOut size={18} />
        </button>
        <button
          type="button"
          id="btn-map-fit-corridor"
          className="map-floating-btn"
          onClick={handleFitCorridor}
          aria-label="Fit full route"
          title="Fit Route Corridor"
        >
          <Compass size={18} />
        </button>
        <button
          type="button"
          id="btn-map-expand"
          className="map-floating-btn"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-label={isExpanded ? 'Minimize map' : 'Expand full screen'}
          title={isExpanded ? 'Minimize Map' : 'Full Screen Map'}
        >
          {isExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>

      {/* Manual Pan Notification Pill */}
      {isUserInteracting && (
        <div
          id="map-free-pan-pill"
          data-testid="map-free-pan-indicator"
          style={{
            position: 'absolute',
            top: '56px',
            left: '16px',
            zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.88)',
            color: '#ffffff',
            padding: '6px 12px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          }}
        >
          <span>Free Pan Active</span>
          <button
            type="button"
            onClick={handleRecenterDriver}
            style={{
              background: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              padding: '2px 8px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Re-center
          </button>
        </div>
      )}

      {/* Bottom Floating Bar: Re-center Driver Action */}
      {driverLocation && (
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            right: '16px',
            zIndex: 1000,
          }}
        >
          <button
            type="button"
            id="btn-recenter-driver"
            onClick={handleRecenterDriver}
            aria-label="Re-center on driver location"
            data-testid="recenter-driver-btn"
            className="map-floating-btn"
            style={{
              padding: '10px 20px',
              gap: '8px',
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              color: '#047857',
              borderColor: '#a7f3d0',
              fontWeight: 700,
              fontSize: '13px',
              boxShadow: '0 4px 18px rgba(4,120,87,0.25)',
              borderRadius: '24px',
            }}
          >
            <Navigation size={16} />
            <span>Re-center Driver</span>
          </button>
        </div>
      )}

      {/* Bottom-Left: Interactive Route Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: '16px',
          left: '16px',
          zIndex: 1000,
          background: 'rgba(255, 255, 255, 0.94)',
          borderRadius: '14px',
          padding: showLegend ? '10px 14px' : '6px 12px',
          border: '1px solid rgba(226, 232, 240, 0.9)',
          boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
          fontSize: '11px',
          color: '#334155',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            cursor: 'pointer',
            fontWeight: 700,
          }}
          onClick={() => setShowLegend(!showLegend)}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Layers size={13} /> Corridor Legend
          </span>
          <span style={{ fontSize: '10px', color: '#64748b' }}>{showLegend ? '▼' : '▲'}</span>
        </div>

        {showLegend && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: isStale ? '#ea580c' : '#059669',
                }}
              />
              <span>{isStale ? 'Driver (Signal Stale)' : 'Driver (Live Active)'}</span>
            </div>
            {myPickup && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#059669', fontWeight: 800 }}>📍</span>
                <span>Your Designated Pickup</span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#2563eb' }} />
              <span>Ride Origin</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🏁</span>
              <span>Final Destination</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '14px', height: '3px', background: '#2563eb', borderRadius: '2px' }} />
              <span>Road Highway Route</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
