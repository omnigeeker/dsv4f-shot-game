/* ============================================================
 * PBR — 加载 ambientCG CC0 贴图（albedo + normal + roughness）
 * 返回 { concrete, dirt, sand, rust, crate }，每个含 color/normal/roughness
 * ============================================================ */
import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const B = 'assets/textures';

function load(path, { srgb = false, repeatX = 1, repeatY = 1 } = {}) {
  return new Promise((resolve) => {
    loader.load(path, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeatX, repeatY);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 8;
      resolve(t);
    }, undefined, () => resolve(null)); // 加载失败 → null，回退程序化贴图
  });
}

export async function loadPBR() {
  const [concreteC, concreteN, concreteR,
         dirtC, dirtN, dirtR,
         sandC, sandN, sandR,
         rustC, rustN, rustR,
         woodC, woodN, woodR] = await Promise.all([
    load(`${B}/Concrete020/Concrete020_1K-JPG_Color.jpg`, { srgb: true, repeatX: 2, repeatY: 2 }),
    load(`${B}/Concrete020/Concrete020_1K-JPG_NormalGL.jpg`, { repeatX: 2, repeatY: 2 }),
    load(`${B}/Concrete020/Concrete020_1K-JPG_Roughness.jpg`, { repeatX: 2, repeatY: 2 }),
    load(`${B}/Ground037/Ground037_1K-JPG_Color.jpg`, { srgb: true, repeatX: 8, repeatY: 8 }),
    load(`${B}/Ground037/Ground037_1K-JPG_NormalGL.jpg`, { repeatX: 8, repeatY: 8 }),
    load(`${B}/Ground037/Ground037_1K-JPG_Roughness.jpg`, { repeatX: 8, repeatY: 8 }),
    load(`${B}/Ground054/Ground054_1K-JPG_Color.jpg`, { srgb: true, repeatX: 8, repeatY: 8 }),
    load(`${B}/Ground054/Ground054_1K-JPG_NormalGL.jpg`, { repeatX: 8, repeatY: 8 }),
    load(`${B}/Ground054/Ground054_1K-JPG_Roughness.jpg`, { repeatX: 8, repeatY: 8 }),
    load(`${B}/Metal063/Metal063_1K-JPG_Color.jpg`, { srgb: true, repeatX: 2, repeatY: 2 }),
    load(`${B}/Metal063/Metal063_1K-JPG_NormalGL.jpg`, { repeatX: 2, repeatY: 2 }),
    load(`${B}/Metal063/Metal063_1K-JPG_Roughness.jpg`, { repeatX: 2, repeatY: 2 }),
    load(`${B}/Wood067/Wood067_1K-JPG_Color.jpg`, { srgb: true }),
    load(`${B}/Wood067/Wood067_1K-JPG_NormalGL.jpg`, {}),
    load(`${B}/Wood067/Wood067_1K-JPG_Roughness.jpg`, {})
  ]);
  return {
    concrete: { color: concreteC, normal: concreteN, roughness: concreteR },
    dirt: { color: dirtC, normal: dirtN, roughness: dirtR },
    sand: { color: sandC, normal: sandN, roughness: sandR },
    rust: { color: rustC, normal: rustN, roughness: rustR },
    crate: { color: woodC, normal: woodN, roughness: woodR }
  };
}
