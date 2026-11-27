export function modelToSTL(model, name = 'mailbox-sign') {
  if (!model) return '';
  const mesh = model.getMesh();
  const { triVerts, vertProperties } = mesh;
  const lines = [`solid ${name}`];

  for (let i = 0; i < triVerts.length; i += 3) {
    const i1 = triVerts[i] * 3;
    const i2 = triVerts[i + 1] * 3;
    const i3 = triVerts[i + 2] * 3;
    lines.push(
      'facet normal 0 0 0',
      '  outer loop',
      `    vertex ${vertProperties[i1]} ${vertProperties[i1 + 1]} ${vertProperties[i1 + 2]}`,
      `    vertex ${vertProperties[i2]} ${vertProperties[i2 + 1]} ${vertProperties[i2 + 2]}`,
      `    vertex ${vertProperties[i3]} ${vertProperties[i3 + 1]} ${vertProperties[i3 + 2]}`,
      '  endloop',
      'endfacet'
    );
  }

  lines.push(`endsolid ${name}`);
  return lines.join('\n');
}
