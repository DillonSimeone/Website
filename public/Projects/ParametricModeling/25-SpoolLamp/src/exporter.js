// STL exporter module for 25-SpoolLamp (uses shared 00-CommonParts/Exporter/stl.js)
import { modelToSTL } from '../../00-CommonParts/Exporter/stl.js';
import { context, params } from './state.js';
import { buildHubPlug, buildWaveHalf } from './geometry.js';
import { buildParametricCasing, buildCasingLid, buildShadeAdapter, buildWallMount } from './casingGeometry.js';

function downloadSTL(stlText, filename) {
    const blob = new Blob([stlText], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
}

export function triggerExport(target) {
    const M = context.Manifold;
    if (!M) return;

    if (target === 'hub') {
        const hub = buildHubPlug(M, params);
        downloadSTL(modelToSTL(hub, 'SpoolLamp_HubPlug_54_5mm'), 'SpoolLamp_54_5mm_Mic_Hub.stl');
        hub.delete();
        return;
    }

    if (target === 'wave_half') {
        const wave = buildWaveHalf(M, params);
        downloadSTL(modelToSTL(wave, `SpoolLamp_WaveHalf_${params.waveMode}`), `SpoolLamp_WaveHalf_${params.waveMode}.stl`);
        wave.delete();
        return;
    }

    if (target === 'casing') {
        const casing = buildParametricCasing(M, params);
        downloadSTL(modelToSTL(casing, `SpoolLamp_Casing_${params.casingPattern}`), `SpoolLamp_Casing_${params.casingPattern}.stl`);
        casing.delete();
        return;
    }

    if (target === 'lid') {
        const lid = buildCasingLid(M, params);
        const tag = params.lidHubCutout ? 'HubCutout' : 'Solid';
        downloadSTL(modelToSTL(lid, `SpoolLamp_ThinLid_${tag}`), `SpoolLamp_ThinLid_${tag}.stl`);
        lid.delete();
        return;
    }

    if (target === 'shade_adapter') {
        const adapter = buildShadeAdapter(M, params);
        downloadSTL(modelToSTL(adapter, 'SpoolLamp_ShadeSTL_Adapter'), 'SpoolLamp_ShadeSTL_Adapter.stl');
        adapter.delete();
        return;
    }

    if (target === 'wall_mount') {
        const mount = buildWallMount(M, params);
        downloadSTL(modelToSTL(mount, 'SpoolLamp_Angled_WallMount'), 'SpoolLamp_Angled_WallMount.stl');
        mount.delete();
        return;
    }

    if (target === 'all_plate') {
        const hub = buildHubPlug(M, params);
        const wave1 = buildWaveHalf(M, params);
        const wave2 = buildWaveHalf(M, params).translate([params.spoolMaxOD + 12, 0, 0]);
        const plate = wave1.add(wave2).add(hub);
        downloadSTL(modelToSTL(plate, 'SpoolLamp_FullPlate'), `SpoolLamp_FullPlate_${params.waveMode}.stl`);
        hub.delete();
        wave1.delete();
        wave2.delete();
        plate.delete();
    }
}
