// Reusable STL Exporter module
export function modelToSTL(model, name) {
    if (!model) return "";
    const mesh = model.getMesh();
    let stl = `solid ${name}\n`;
    for (let i = 0; i < mesh.triVerts.length; i += 3) {
        const i1 = mesh.triVerts[i], i2 = mesh.triVerts[i+1], i3 = mesh.triVerts[i+2];
        const v1 = [mesh.vertProperties[i1*3], mesh.vertProperties[i1*3+1], mesh.vertProperties[i1*3+2]];
        const v2 = [mesh.vertProperties[i2*3], mesh.vertProperties[i2*3+1], mesh.vertProperties[i2*3+2]];
        const v3 = [mesh.vertProperties[i3*3], mesh.vertProperties[i3*3+1], mesh.vertProperties[i3*3+2]];
        stl += `facet normal 0 0 0\n  outer loop\n    vertex ${v1[0]} ${v1[1]} ${v1[2]}\n    vertex ${v2[0]} ${v2[1]} ${v2[2]}\n    vertex ${v3[0]} ${v3[1]} ${v3[2]}\n  endloop\nendfacet\n`;
    }
    stl += `endsolid ${name}`;
    return stl;
}
