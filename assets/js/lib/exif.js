/* Minimal EXIF reader for JPEG and TIFF. Returns { ifd0, exif, gps } keyed by tag name, or null. */
(function (root) {
  'use strict';

  const IFD0_TAGS = {
    0x010e: 'ImageDescription', 0x010f: 'Make', 0x0110: 'Model', 0x0112: 'Orientation',
    0x011a: 'XResolution', 0x011b: 'YResolution', 0x0131: 'Software', 0x0132: 'DateTime',
    0x013b: 'Artist', 0x8298: 'Copyright', 0x8769: 'ExifIFDPointer', 0x8825: 'GPSInfoIFDPointer',
  };
  const EXIF_TAGS = {
    0x829a: 'ExposureTime', 0x829d: 'FNumber', 0x8822: 'ExposureProgram', 0x8827: 'ISO',
    0x9003: 'DateTimeOriginal', 0x9004: 'DateTimeDigitized', 0x9010: 'OffsetTime', 0x9011: 'OffsetTimeOriginal',
    0x9201: 'ShutterSpeedValue', 0x9202: 'ApertureValue', 0x9209: 'Flash', 0x920a: 'FocalLength',
    0x9290: 'SubSecTime', 0x9291: 'SubSecTimeOriginal',
    0xa002: 'PixelXDimension', 0xa003: 'PixelYDimension', 0xa405: 'FocalLengthIn35mmFilm',
    0xa420: 'ImageUniqueID', 0xa430: 'CameraOwnerName', 0xa431: 'BodySerialNumber',
    0xa432: 'LensSpecification', 0xa433: 'LensMake', 0xa434: 'LensModel', 0xa435: 'LensSerialNumber',
  };
  const GPS_TAGS = {
    0x0000: 'GPSVersionID', 0x0001: 'GPSLatitudeRef', 0x0002: 'GPSLatitude', 0x0003: 'GPSLongitudeRef',
    0x0004: 'GPSLongitude', 0x0005: 'GPSAltitudeRef', 0x0006: 'GPSAltitude', 0x0007: 'GPSTimeStamp',
    0x000c: 'GPSSpeedRef', 0x000d: 'GPSSpeed', 0x0010: 'GPSImgDirectionRef', 0x0011: 'GPSImgDirection',
    0x0012: 'GPSMapDatum', 0x001d: 'GPSDateStamp', 0x001f: 'GPSHPositioningError',
  };
  const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

  function findTiffStart(v) {
    if (v.byteLength < 8) return -1;
    const first = v.getUint16(0);
    if (first === 0x4949 || first === 0x4d4d) return 0; // bare TIFF
    if (first !== 0xffd8) return -1; // not JPEG
    let off = 2;
    while (off + 4 <= v.byteLength) {
      const marker = v.getUint16(off);
      if ((marker & 0xff00) !== 0xff00) return -1;
      if (marker === 0xffda || marker === 0xffd9) return -1; // start of scan / end — no EXIF before image data
      const size = v.getUint16(off + 2);
      if (marker === 0xffe1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966 && v.getUint16(off + 8) === 0) {
        return off + 10;
      }
      off += 2 + size;
    }
    return -1;
  }

  function parse(buffer) {
    const v = new DataView(buffer);
    const t = findTiffStart(v);
    if (t < 0 || t + 8 > v.byteLength) return null;
    const order = v.getUint16(t);
    if (order !== 0x4949 && order !== 0x4d4d) return null;
    const le = order === 0x4949;
    const u16 = (o) => v.getUint16(o, le);
    const u32 = (o) => v.getUint32(o, le);
    const i32 = (o) => v.getInt32(o, le);
    if (u16(t + 2) !== 42) return null;

    function readValue(type, count, off) {
      const out = [];
      switch (type) {
        case 2: { // ASCII
          let s = '';
          for (let i = 0; i < count; i++) {
            const c = v.getUint8(off + i);
            if (c === 0) break;
            s += String.fromCharCode(c);
          }
          return s.trim();
        }
        case 1: case 6: case 7:
          for (let i = 0; i < count; i++) out.push(v.getUint8(off + i));
          break;
        case 3:
          for (let i = 0; i < count; i++) out.push(u16(off + i * 2));
          break;
        case 4:
          for (let i = 0; i < count; i++) out.push(u32(off + i * 4));
          break;
        case 9:
          for (let i = 0; i < count; i++) out.push(i32(off + i * 4));
          break;
        case 5:
          for (let i = 0; i < count; i++) { const d = u32(off + i * 8 + 4); out.push(d ? u32(off + i * 8) / d : 0); }
          break;
        case 10:
          for (let i = 0; i < count; i++) { const d = i32(off + i * 8 + 4); out.push(d ? i32(off + i * 8) / d : 0); }
          break;
        default:
          return undefined;
      }
      return out.length === 1 ? out[0] : out;
    }

    function readIFD(rel, names) {
      const out = {};
      const base = t + rel;
      if (rel <= 0 || base + 2 > v.byteLength) return out;
      const n = u16(base);
      for (let i = 0; i < n; i++) {
        const e = base + 2 + i * 12;
        if (e + 12 > v.byteLength) break;
        const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
        const size = (TYPE_SIZE[type] || 1) * count;
        if (count > 100000) continue;
        const valOff = size > 4 ? t + u32(e + 8) : e + 8;
        if (valOff + size > v.byteLength) continue;
        const name = names[tag];
        if (!name) continue;
        const val = readValue(type, count, valOff);
        if (val !== undefined && val !== '') out[name] = val;
      }
      return out;
    }

    const ifd0 = readIFD(u32(t + 4), IFD0_TAGS);
    const exif = ifd0.ExifIFDPointer ? readIFD(ifd0.ExifIFDPointer, EXIF_TAGS) : {};
    const gps = ifd0.GPSInfoIFDPointer ? readIFD(ifd0.GPSInfoIFDPointer, GPS_TAGS) : {};
    delete ifd0.ExifIFDPointer;
    delete ifd0.GPSInfoIFDPointer;
    return { ifd0, exif, gps, littleEndian: le };
  }

  /** Converts GPS IFD values to decimal coordinates, or null if absent. */
  function gpsToDecimal(gps) {
    const dms = (a) => (Array.isArray(a) ? a[0] + (a[1] || 0) / 60 + (a[2] || 0) / 3600 : typeof a === 'number' ? a : NaN);
    if (!gps || gps.GPSLatitude == null || gps.GPSLongitude == null) return null;
    let lat = dms(gps.GPSLatitude);
    let lon = dms(gps.GPSLongitude);
    if (!isFinite(lat) || !isFinite(lon) || (lat === 0 && lon === 0)) return null;
    if (/S/i.test(gps.GPSLatitudeRef || '')) lat = -lat;
    if (/W/i.test(gps.GPSLongitudeRef || '')) lon = -lon;
    let alt = typeof gps.GPSAltitude === 'number' ? gps.GPSAltitude : null;
    if (alt != null && gps.GPSAltitudeRef === 1) alt = -alt;
    return { lat: +lat.toFixed(6), lon: +lon.toFixed(6), alt };
  }

  root.AtlasExif = { parse, gpsToDecimal };
})(typeof window !== 'undefined' ? window : globalThis);
