import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { getCityCoords } from '../utils/geocode';
import {
  ComposableMap, Geographies, Geography, Marker, ZoomableGroup,
} from 'react-simple-maps';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

function markerColor(count) {
  if (count >= 11) return '#0284C7';
  if (count >= 7)  return '#0EA5E9';
  if (count >= 4)  return '#38BDF8';
  if (count >= 2)  return '#7DD3FC';
  return '#BAE6FD';
}

function markerRadius(count) {
  return Math.min(4 + count * 2, 18);
}

export default function WorldMap() {
  const [cities, setCities] = useState([]);
  const [tooltip, setTooltip] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const q = query(
          collection(db, 'family_members'),
          where('status', '==', 'approved'),
        );
        const snap = await getDocs(q);
        const counts = {};
        snap.forEach((doc) => {
          const city = (doc.data().city || '').trim();
          if (!city) return;
          counts[city] = (counts[city] || 0) + 1;
        });
        const result = [];
        for (const [city, count] of Object.entries(counts)) {
          const coords = getCityCoords(city);
          if (coords) result.push({ city, count, coords });
        }
        setCities(result);
      } catch (err) {
        console.error('WorldMap load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 130, center: [15, 10] }}
        style={{ width: '100%', height: 'auto' }}
      >
        <ZoomableGroup zoom={1} minZoom={0.8} maxZoom={6}>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="#1e293b"
                  stroke="#334155"
                  strokeWidth={0.4}
                  style={{
                    default: { outline: 'none' },
                    hover:   { fill: '#1d3d5e', outline: 'none' },
                    pressed: { outline: 'none' },
                  }}
                />
              ))
            }
          </Geographies>

          {cities.map(({ city, count, coords }) => (
            <Marker
              key={city}
              coordinates={coords}
              onMouseEnter={() => setTooltip({ city, count })}
              onMouseLeave={() => setTooltip(null)}
              onClick={() => setTooltip(tooltip?.city === city ? null : { city, count })}
              style={{ cursor: 'pointer' }}
            >
              <circle
                r={markerRadius(count)}
                fill={markerColor(count)}
                fillOpacity={0.85}
                stroke="#fff"
                strokeWidth={1.2}
              />
            </Marker>
          ))}
        </ZoomableGroup>
      </ComposableMap>

      {/* Tooltip */}
      {tooltip && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-sm text-white text-sm px-4 py-2 rounded-xl border border-sky-500/40 pointer-events-none shadow-xl">
          <p className="font-semibold text-sky-300">{tooltip.city}</p>
          <p className="text-slate-300 text-xs mt-0.5">
            {tooltip.count} family member{tooltip.count > 1 ? 's' : ''} here
            {' · '}
            <span className="text-sky-400">Contact allova@mengko.com</span>
          </p>
        </div>
      )}

      {/* Legend */}
      {cities.length > 0 && (
        <div className="absolute top-3 right-3 bg-slate-900/80 backdrop-blur-sm rounded-xl px-3 py-2 border border-slate-700">
          <p className="text-slate-400 text-xs mb-1.5 font-medium">Members per city</p>
          {[
            { label: '1',    color: '#BAE6FD' },
            { label: '2-3',  color: '#7DD3FC' },
            { label: '4-6',  color: '#38BDF8' },
            { label: '7-10', color: '#0EA5E9' },
            { label: '11+',  color: '#0284C7' },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5 mb-1">
              <div className="w-3 h-3 rounded-full border border-white/30" style={{ background: color }} />
              <span className="text-slate-300 text-xs">{label}</span>
            </div>
          ))}
        </div>
      )}

      {cities.length === 0 && !loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-slate-500 text-sm">No approved members yet</p>
        </div>
      )}
    </div>
  );
}
