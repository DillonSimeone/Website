// world-worker.js

let baseUrl = '/'; // Default base URL

self.onmessage = async (e) => {
    if (e.data.type === 'init') {
        baseUrl = e.data.baseUrl;
        return; // Important: do not proceed with loadModel if it's just an init message
    }

    if (e.data.type === 'loadModel') {
        const modelName = e.data.modelName;
        
        try {
            // 1. Fetch Manifest
            const manifestUrl = `${baseUrl}assets/${modelName}/manifest.json`;
            const manifestRes = await fetch(manifestUrl);
            if (!manifestRes.ok) throw new Error(`Could not find manifest for ${modelName}`);
            const manifest = await manifestRes.json();
            self.postMessage({ type: 'manifestLoaded', manifest });

            // 2. Stream Visual Chunks
            for (const chunkFile of manifest.chunkFiles) {
                const chunkUrl = `${baseUrl}assets/${modelName}/${chunkFile.file}`;
                const chunkRes = await fetch(chunkUrl);
                const chunkData = await chunkRes.json();
                self.postMessage({ type: 'chunkLoaded', chunkData });
            }
            
            // 3. Stream Pre-baked Physics Chunks
            self.postMessage({ type: 'physicsProcessingStart' });
            const physicsUrl = `${baseUrl}assets/${modelName}/${manifest.physicsFile}`;
            const physicsRes = await fetch(physicsUrl);
            const physicsData = await physicsRes.json(); // This is an array of box-groups

            for (const boxGroup of physicsData) {
                self.postMessage({ type: 'physicsChunkLoaded', boxes: boxGroup });
            }

            self.postMessage({ type: 'loadComplete' });

        } catch (err) {
            self.postMessage({ type: 'error', message: err.message });
        }
    }
};
