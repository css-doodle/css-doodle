export default async function svgToPng(svg, width, height, scale) {
    let source = `data:image/svg+xml;utf8,${ encodeURIComponent(svg) }`;
    let img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = source;
    await img.decode();

    let canvas = document.createElement('canvas');
    let ctx = canvas.getContext('2d');

    let dpr = scale === 1 ? devicePixelRatio : 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    let blob = await new Promise(resolve => canvas.toBlob(resolve));
    return { blob, source };
}
