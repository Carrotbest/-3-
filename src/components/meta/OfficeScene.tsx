import { useEffect, useRef } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"

import { META_FACILITIES, META_OBJECTS } from "@/components/meta/facilities"
import type { PresencePerson } from "@/components/meta/usePresencePeople"
import type { PresenceMood } from "@/data/presence"
import { routeDefinitions } from "@/routes/route-config"

interface OfficeSceneProps {
  people: PresencePerson[]
  focusUid: string | null
  selectedRoomPath: string | null
  onPick: (kind: "room" | "person" | "facility" | "spot" | "object", id: string, path?: string) => void
  bubbles?: Record<string, { text: string; at: number }>
}

type ZoneKey = "overview" | "sample" | "tech" | "trend" | "system"

type RoomShape = "rect" | "round" | "stadium" | "chamfer" | "ell"

interface RoomCoordinate {
  zone: ZoneKey
  x: number
  z: number
  w: number
  d: number
  entrance: "north" | "south" | "east" | "west"
  shape?: RoomShape
}

interface Room extends RoomCoordinate {
  path: string
  title: string
}

const ROOM_COORDINATES: Record<string, RoomCoordinate> = {
  "/development/workspace": { zone: "sample", x: -22.5, z: -25.5, w: 35, d: 9, entrance: "south", shape: "rect" },
  "/fabric-analysis": { zone: "sample", x: -30, z: -16, w: 20, d: 10, entrance: "south", shape: "round" },
  "/request": { zone: "sample", x: -11.5, z: -16, w: 17, d: 10, entrance: "south", shape: "chamfer" },
  "/warehouse": { zone: "sample", x: -27, z: -7, w: 26, d: 8, entrance: "south", shape: "rect" },
  "/cost": { zone: "sample", x: -8, z: -7, w: 10, d: 8, entrance: "east", shape: "round" },
  "/study": { zone: "tech", x: 14, z: -25, w: 22, d: 10, entrance: "south", shape: "rect" },
  "/protocol": { zone: "tech", x: 32.5, z: -25, w: 15, d: 10, entrance: "south", shape: "round" },
  "/rdda": { zone: "tech", x: 12.5, z: -15.5, w: 19, d: 9, entrance: "south", shape: "chamfer" },
  "/ts": { zone: "tech", x: 31, z: -15.5, w: 18, d: 9, entrance: "south", shape: "round" },
  "/": { zone: "overview", x: -27.5, z: 7, w: 25, d: 8, entrance: "east", shape: "stadium" },
  "/meta": { zone: "overview", x: -31.5, z: 18.5, w: 17, d: 11, entrance: "east", shape: "round" },
  "/trend/fabric": { zone: "trend", x: 10.5, z: 9, w: 15, d: 12, entrance: "west", shape: "rect" },
  "/trend/macro": { zone: "trend", x: 29, z: 9, w: 22, d: 12, entrance: "north", shape: "chamfer" },
  "/trend/portfolio": { zone: "trend", x: 10.5, z: 20.5, w: 15, d: 10, entrance: "north", shape: "stadium" },
  "/calendar": { zone: "trend", x: 23, z: 20.5, w: 10, d: 10, entrance: "north", shape: "round" },
  "/process-innovation": { zone: "trend", x: 34, z: 20.5, w: 12, d: 10, entrance: "north", shape: "stadium" },
  "/setting": { zone: "system", x: 0, z: 21, w: 8, d: 8, entrance: "south", shape: "rect" },
}

const ROOM_ACCENT: Record<string, string> = {
  "/": "#4a7fd4",
  "/meta": "#6a5ac9",
  "/development/workspace": "#2f8f7d",
  "/request": "#3f9ad0",
  "/fabric-analysis": "#d08a4a",
  "/cost": "#c0603f",
  "/warehouse": "#7a8899",
  "/ts": "#d4564f",
  "/study": "#8a6d4a",
  "/protocol": "#5a84c4",
  "/rdda": "#2f7fb0",
  "/trend/fabric": "#b069c4",
  "/trend/macro": "#c44d7a",
  "/trend/portfolio": "#7a5cc4",
  "/calendar": "#4aa36a",
  "/process-innovation": "#9a9a9a",
  "/setting": "#5f6b7a",
}

const ACCENT_FALLBACK = "#c8ced8"

const WAREHOUSE_RACKS: Array<[number, number]> = [
  [-10.5, -1.8], [-6.3, -1.8], [-2.1, -1.8],
  [-10.5, 1.8], [-6.3, 1.8], [-2.1, 1.8],
  [8.8, -1.8], [8.8, 1.8],
]

const ROLL_LENGTHS = [0.62, 0.72, 0.82]

const SECTION_SIGNS: Array<{ text: string; tone: ZoneKey; x: number; z: number; facing: number }> = [
  { text: "DEVELOPMENT", tone: "sample", x: -22, z: -3, facing: 0 },
  { text: "TECHNICAL", tone: "tech", x: 22, z: -3, facing: 0 },
  { text: "LOBBY", tone: "overview", x: -22, z: 3, facing: Math.PI },
  { text: "SHOWROOM", tone: "trend", x: 22, z: 3, facing: Math.PI },
  { text: "SERVER", tone: "system", x: 0, z: 17, facing: 0 },
]

const accentOf = (path: string) => ROOM_ACCENT[path] ?? ACCENT_FALLBACK

type FloorPattern = "plain" | "grid" | "stripe" | "dot" | "herringbone"


const ROOMS: Room[] = routeDefinitions.flatMap((route) => {
  const coordinate = ROOM_COORDINATES[route.path]
  return coordinate ? [{ path: route.path, title: route.title, ...coordinate }] : []
})

const LIGHT_ZONE_COLORS: Record<ZoneKey, string> = {
  overview: "#6366f1",
  sample: "#0d9488",
  tech: "#ea580c",
  trend: "#c026d3",
  system: "#475569",
}

const DARK_ZONE_COLORS: Record<ZoneKey, string> = {
  overview: "#8b8df5",
  sample: "#2bb5a4",
  tech: "#f3883f",
  trend: "#dd63e8",
  system: "#7d8a9c",
}

const PLANT_SIZES = [1, 1.45, 0.78]

const FABRIC_COLORS = ["#d9c8a8", "#8fa9c4", "#c49a8f", "#9ab49a", "#d4b06a", "#7f8fa6", "#c8a8c4", "#a89b8f"]

const FABRIC_PALETTE = [...FABRIC_COLORS, "#c9b4d4", "#8fb8a8", "#d9a9a0", "#a8b4c9"]

const FIT_H = 78
const FIT_W = 128

interface SceneTheme {
  bg: THREE.Color
  floor: THREE.Color
  wall: THREE.Color
  glass: THREE.Color
  desk: THREE.Color
  metal: THREE.Color
  screen: THREE.Color
  tile: THREE.Color
  darkFloor: THREE.Color
  wood: THREE.Color
  foreground: string
  panel: string
  muted: string
  line: string
  dark: boolean
  zones: Record<ZoneKey, string>
  neon: Record<ZoneKey, string>
}

interface LabelOptions {
  color?: string
  badgeColor?: string
  mood?: PresenceMood
  zone?: ZoneKey
  size?: number
  weight?: number
  pad?: number
  scale?: number
}

interface PersonVisual {
  data: PresencePerson
  group: THREE.Group
  body: THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>
  head: THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>
  base: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshLambertMaterial>
  glowRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
  selfRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
  focusRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
  tag: THREE.Sprite
  leftLeg: THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>
  rightLeg: THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>
  flagPole: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshLambertMaterial>
  flag: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshLambertMaterial>
  flagBasePositions: Float32Array
  hit: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>
  avatarParts: Array<THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>>
  poseParts: Array<THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>>
  target: THREE.Vector3
  seated: boolean
  targetSeated: boolean
  phase: number
}

interface SceneApi {
  syncPeople: (people: PresencePerson[]) => void
  setBubbles: (map: Record<string, { text: string; at: number }>) => void
  focusPerson: (uid: string | null, moveCamera: boolean) => void
  selectRoom: (path: string | null) => void
}

function cssValue(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  return styles.getPropertyValue(name).trim() || fallback
}

function readTheme(): SceneTheme {
  const root = document.documentElement
  const styles = getComputedStyle(root)
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches
  const explicitLight = root.classList.contains("light") || root.dataset.theme === "light"
  const dark = root.classList.contains("dark") || root.dataset.theme === "dark" || (!explicitLight && systemDark)

  return {
    bg: new THREE.Color(cssValue(styles, "--scene-bg", dark ? "#141a23" : "#eaeff6")),
    floor: new THREE.Color(cssValue(styles, "--scene-floor", dark ? "#1d2531" : "#e4e9f0")),
    wall: new THREE.Color(cssValue(styles, "--scene-wall", dark ? "#2a3240" : "#f2f5f9")),
    glass: new THREE.Color(cssValue(styles, "--scene-glass", dark ? "#4a79ab" : "#b9d4ef")),
    desk: new THREE.Color(cssValue(styles, "--scene-desk", dark ? "#4a4336" : "#f0e7d6")),
    metal: new THREE.Color(cssValue(styles, "--scene-metal", dark ? "#5a6675" : "#aab6c6")),
    screen: new THREE.Color(cssValue(styles, "--scene-screen", dark ? "#5b9bff" : "#3f7ae0")),
    tile: new THREE.Color(cssValue(styles, "--scene-tile", dark ? "#262e3a" : "#edf0f5")),
    darkFloor: new THREE.Color(cssValue(styles, "--scene-dark", dark ? "#232b37" : "#6b7788")),
    wood: new THREE.Color(cssValue(styles, "--scene-wood", dark ? "#6b5438" : "#d8b88a")),
    foreground: cssValue(styles, "--foreground", dark ? "#e9edf3" : "#15191f"),
    panel: cssValue(styles, "--card", dark ? "#1a1f27" : "#ffffff"),
    muted: cssValue(styles, "--muted-foreground", dark ? "#a2adbb" : "#5d6775"),
    line: cssValue(styles, "--border", dark ? "#2c343f" : "#d8dee7"),
    dark,
    zones: dark ? DARK_ZONE_COLORS : LIGHT_ZONE_COLORS,
    neon: {
      overview: cssValue(styles, "--neon-overview", "#3fa8c9"),
      sample: cssValue(styles, "--neon-sample", "#3fa899"),
      tech: cssValue(styles, "--neon-tech", "#d08a4a"),
      trend: cssValue(styles, "--neon-trend", "#b069c4"),
      system: cssValue(styles, "--neon-system", "#5a84c4"),
    },
  }
}

function disposeObject(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()

  root.traverse((object) => {
    if (object instanceof THREE.Mesh) geometries.add(object.geometry)
    if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Sprite)) return
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material]
    objectMaterials.forEach((material) => {
      materials.add(material)
      const map = (material as THREE.Material & { map?: THREE.Texture | null }).map
      if (map) textures.add(map)
    })
  })

  textures.forEach((texture) => texture.dispose())
  materials.forEach((material) => material.dispose())
  geometries.forEach((geometry) => geometry.dispose())
}

export function OfficeScene({ people, focusUid, selectedRoomPath, onPick, bubbles }: OfficeSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const apiRef = useRef<SceneApi | null>(null)
  const onPickRef = useRef(onPick)
  const peopleKey = people.map((person) => [person.uid, person.name, person.path, person.screen, person.color, person.isSelf, person.ago].join("\u0001")).join("\u0002")
  onPickRef.current = onPick

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let theme = readTheme()
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap

    const scene = new THREE.Scene()
    scene.background = theme.bg
    scene.fog = theme.dark ? new THREE.Fog(theme.bg, 150, 320) : null

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400)
    camera.position.set(0, 70, 68)

    const controls = new OrbitControls(camera, canvas)
    controls.target.set(0, 0, -2)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minPolarAngle = 0
    controls.maxPolarAngle = Math.PI / 2
    controls.minZoom = 0.55
    controls.maxZoom = 26
    controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE
    controls.update()

    const hemi = new THREE.HemisphereLight(
      theme.dark ? 0x5b7ba8 : 0xffffff,
      theme.dark ? 0x1a222e : 0xaeb8c6,
      theme.dark ? 0.85 : 0.58,
    )
    scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xffffff, theme.dark ? 0.8 : 0.62)
    sun.position.set(26, 44, 20)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 140
    Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60 })
    sun.shadow.bias = -0.0008
    sun.shadow.normalBias = 0.02
    scene.add(sun)
    const ambient = new THREE.AmbientLight(0xffffff, theme.dark ? 0.25 : 0.32)
    scene.add(ambient)
    const fill = new THREE.DirectionalLight(0xffffff, theme.dark ? 0.3 : 0.35)
    fill.position.set(-30, 20, -25)
    scene.add(fill)
    // 켜진 방에만 진짜 광원을 배정한다. 방마다 두면 열일곩이라 셀이더 한도에 걸린다.
    const ROOM_LIGHT_COUNT = 8
    const roomLights = Array.from({ length: ROOM_LIGHT_COUNT }, () => {
      const light = new THREE.PointLight(0xfffaf4, 0, 32, 1.2)
      light.castShadow = false
      scene.add(light)
      return light
    })

    const materials = {
      floor: new THREE.MeshLambertMaterial({ color: theme.floor, side: THREE.DoubleSide }),
      wall: new THREE.MeshLambertMaterial({ color: theme.wall }),
      desk: new THREE.MeshLambertMaterial({ color: theme.desk }),
      metal: new THREE.MeshLambertMaterial({ color: theme.metal }),
      screen: new THREE.MeshBasicMaterial({ color: theme.screen }),
      wood: new THREE.MeshLambertMaterial({ color: theme.wood }),
      dark: new THREE.MeshLambertMaterial({ color: theme.darkFloor }),
      paper: new THREE.MeshLambertMaterial({ color: theme.dark ? 0xcdd4de : 0xeceff4 }),
      board: new THREE.MeshLambertMaterial({ color: theme.dark ? 0xd7dde6 : 0xf7f9fc }),
      chair: new THREE.MeshLambertMaterial({ color: theme.dark ? 0x4c5664 : 0x687386 }),
      sofa: new THREE.MeshLambertMaterial({ color: theme.dark ? 0x50596a : 0x8893a6 }),
      green: new THREE.MeshLambertMaterial({ color: 0x56815b }),
      glass: new THREE.MeshPhysicalMaterial({
        color: theme.glass,
        transparent: true,
        opacity: theme.dark ? 0.16 : 0.22,
        depthWrite: false,
        roughness: 0.18,
        transmission: 0.15,
      }),
      amber: new THREE.MeshBasicMaterial({ color: 0xffd27a }),
      yellow: new THREE.MeshBasicMaterial({ color: 0xfacc15 }),
    }
    const SECTION_TONE: Record<ZoneKey, { chair: string; carpet: FloorPattern }> = {
      sample: { chair: "#3d8f86", carpet: "grid" },
      tech: { chair: "#b5664a", carpet: "herringbone" },
      overview: { chair: "#4a6fb5", carpet: "plain" },
      trend: { chair: "#9a5aa8", carpet: "stripe" },
      system: { chair: "#6b7686", carpet: "grid" },
    }

    let activeZone: ZoneKey = "overview"
    let toneRoomPath = "/"
    const chairMaterials = new Map<ZoneKey, THREE.MeshLambertMaterial>()
    const chairMat = () => {
      const existing = chairMaterials.get(activeZone)
      if (existing) return existing
      const base = new THREE.Color(SECTION_TONE[activeZone].chair)
      if (theme.dark) base.lerp(new THREE.Color(0x000000), 0.35)
      const created = new THREE.MeshLambertMaterial({ color: base })
      chairMaterials.set(activeZone, created)
      return created
    }
    const sofaMaterials = new Map<string, THREE.MeshLambertMaterial>()
    const sofaMat = () => {
      const existing = sofaMaterials.get(toneRoomPath)
      if (existing) return existing
      const base = new THREE.Color(accentOf(toneRoomPath)).lerp(new THREE.Color(0xffffff), theme.dark ? 0.18 : 0.55)
      const created = new THREE.MeshLambertMaterial({ color: base })
      sofaMaterials.set(toneRoomPath, created)
      return created
    }
    const SCREEN_KINDS = ["grid", "chart", "line"] as const
    type ScreenKind = typeof SCREEN_KINDS[number]
    const screenCanvasFor = (kind: ScreenKind) => {
      const canvas = document.createElement("canvas")
      canvas.width = 256
      canvas.height = 160
      const ctx = canvas.getContext("2d")
      if (!ctx) return canvas
      ctx.fillStyle = "#f8fbff"
      ctx.fillRect(0, 0, 256, 160)
      ctx.fillStyle = "#1f3a5f"
      ctx.fillRect(0, 0, 256, 20)
      ctx.fillStyle = "#8fb8e8"
      ctx.fillRect(10, 7, 58, 6)
      if (kind === "grid") {
        ctx.strokeStyle = "#d8e2ee"
        ctx.lineWidth = 1
        ;[80, 128, 176, 224].forEach((x) => {
          ctx.beginPath()
          ctx.moveTo(x + 0.5, 0)
          ctx.lineTo(x + 0.5, 20)
          ctx.stroke()
        })
        const statusColors = ["#22a06b", "#e89b2d", "#d4564f"]
        for (let row = 0; row < 8; row += 1) {
          ctx.fillStyle = row % 2 ? "#eef4fb" : "#ffffff"
          ctx.fillRect(0, 26 + row * 16, 256, 16)
          ctx.fillStyle = "#3f7ae0"
          ctx.fillRect(12, 32 + row * 16, 34 + (row * 13) % 40, 5)
          ctx.fillStyle = "#a6b6c8"
          ctx.fillRect(108, 32 + row * 16, 48 + (row * 7) % 62, 5)
          ctx.fillStyle = statusColors[row % statusColors.length]
          ctx.beginPath()
          ctx.arc(242, 34 + row * 16, 3, 0, Math.PI * 2)
          ctx.fill()
        }
      } else if (kind === "chart") {
        const heights = [48, 86, 62, 104, 74, 118]
        ctx.strokeStyle = "#d9e2ed"
        ctx.lineWidth = 1
        ;[50, 85, 120].forEach((y) => {
          ctx.beginPath()
          ctx.moveTo(10, y + 0.5)
          ctx.lineTo(246, y + 0.5)
          ctx.stroke()
        })
        heights.forEach((height, index) => {
          ctx.fillStyle = index % 2 ? "#2f9e8f" : "#3f7ae0"
          ctx.fillRect(20 + index * 38, 146 - height, 24, height)
          ctx.fillStyle = "#d9f4ff"
          ctx.fillRect(20 + index * 38, 146 - height, 24, 2)
        })
        ctx.strokeStyle = "#cdd8e6"
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(10, 147)
        ctx.lineTo(246, 147)
        ctx.stroke()
      } else {
        ctx.strokeStyle = "#e3eaf3"
        ctx.lineWidth = 1
        for (let line = 1; line < 5; line += 1) {
          ctx.beginPath()
          ctx.moveTo(10, 26 + line * 26)
          ctx.lineTo(246, 26 + line * 26)
          ctx.stroke()
        }
        const points = [112, 92, 104, 68, 80, 50, 58, 32]
        ctx.fillStyle = "rgba(212, 86, 79, 0.12)"
        ctx.beginPath()
        points.forEach((value, index) => {
          const px = 14 + index * 33
          const py = 26 + value
          if (index === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        })
        ctx.lineTo(14 + (points.length - 1) * 33, 147)
        ctx.lineTo(14, 147)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = "#d4564f"
        ctx.lineWidth = 3
        ctx.beginPath()
        points.forEach((value, index) => {
          const px = 14 + index * 33
          const py = 26 + value
          if (index === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        })
        ctx.stroke()
        ctx.fillStyle = "#d4564f"
        points.forEach((value, index) => {
          ctx.beginPath()
          ctx.arc(14 + index * 33, 26 + value, 2.5, 0, Math.PI * 2)
          ctx.fill()
        })
      }
      ctx.strokeStyle = "#dce7f3"
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(238, 10, 5, 0, Math.PI * 2)
      ctx.moveTo(238, 10)
      ctx.lineTo(238, 6.5)
      ctx.moveTo(238, 10)
      ctx.lineTo(241, 11.5)
      ctx.stroke()
      return canvas
    }
    const screenKindMaterials = new Map<ScreenKind, THREE.MeshBasicMaterial>()
    const screenOf = (kind: ScreenKind) => {
      const existing = screenKindMaterials.get(kind)
      if (existing) return existing
      const created = new THREE.MeshBasicMaterial({ map: textureOf(screenCanvasFor(kind)) })
      screenKindMaterials.set(kind, created)
      return created
    }
    let screenSeed = 0
    const screenMat = () => screenOf(SCREEN_KINDS[screenSeed++ % SCREEN_KINDS.length])

    const geometries = {
      box: new THREE.BoxGeometry(1, 1, 1),
      plane: new THREE.PlaneGeometry(1, 1),
      cylinder: new THREE.CylinderGeometry(1, 1, 1, 14),
      sphere: new THREE.SphereGeometry(1, 14, 10),
      cone: new THREE.ConeGeometry(1, 1, 14),
      ico: new THREE.IcosahedronGeometry(1, 0),
    }
    const neonMaterials = Object.fromEntries(Object.entries(theme.neon).map(([zone, color]) => [zone, new THREE.MeshBasicMaterial({ color })])) as Record<ZoneKey, THREE.MeshBasicMaterial>
    const accentMaterials = new Map<string, THREE.MeshLambertMaterial>()
    const accentMaterialOf = (path: string) => {
      const existing = accentMaterials.get(path)
      if (existing) return existing
      const created = new THREE.MeshLambertMaterial({ color: accentOf(path) })
      accentMaterials.set(path, created)
      return created
    }

    const box = (
      width: number,
      height: number,
      depth: number,
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
      parent: THREE.Object3D = scene,
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(geometries.box, material)
      mesh.scale.set(width, height, depth)
      mesh.position.set(x, y, z)
      mesh.castShadow = true
      mesh.receiveShadow = true
      parent.add(mesh)
      return mesh
    }

    let neonStripCount = 0
    const neonBox = (
      width: number,
      height: number,
      depth: number,
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
      parent: THREE.Object3D = scene,
    ) => {
      const strip = box(width, height, depth, material, x, y, z, parent)
      strip.castShadow = false
      strip.receiveShadow = false
      strip.renderOrder = 4
      neonStripCount += 1
      return strip
    }

    const ground = new THREE.Mesh(geometries.plane, materials.floor)
    ground.scale.set(82, 58, 1)
    ground.rotation.x = -Math.PI / 2
    ground.position.set(0, 0, -2)
    ground.receiveShadow = true
    scene.add(ground)
    const sceneDecor = new THREE.Group()
    scene.add(sceneDecor)
    const addOuterWall = (width: number, depth: number, x: number, z: number) => {
      const horizontal = width > depth
      const span = horizontal ? width : depth
      const thickness = horizontal ? depth : width
      box(width, 0.9, depth, materials.wall, x, 0.45, z)
      box(horizontal ? width : thickness + 0.1, 0.25, horizontal ? thickness + 0.1 : depth, materials.wall, x, 3.52, z)
      box(width, 0.1, depth, materials.wall, x, 2.15, z)
      const mullions = Math.max(2, Math.round(span / 4))
      const step = span / mullions
      const posts: Array<{ position: [number, number, number]; scale: [number, number, number] }> = []
      const panes: Array<{ position: [number, number, number]; scale: [number, number, number] }> = []
      for (let index = 0; index <= mullions; index += 1) {
        const offset = -span / 2 + index * step
        posts.push({
          position: horizontal ? [x + offset, 2.15, z] : [x, 2.15, z + offset],
          scale: horizontal ? [0.25, 2.5, thickness + 0.06] : [thickness + 0.06, 2.5, 0.25],
        })
        if (index === mullions) continue
        const center = offset + step / 2
        panes.push({
          position: horizontal ? [x + center, 2.15, z] : [x, 2.15, z + center],
          scale: horizontal ? [step - 0.25, 2.5, thickness * 0.6] : [thickness * 0.6, 2.5, step - 0.25],
        })
      }
      addInstanced(scene, geometries.box, materials.wall, posts, true)
      const glass = addInstanced(scene, geometries.box, materials.glass, panes)
      glass.castShadow = false
      glass.renderOrder = 3
    }

    const corridorMaterial = new THREE.MeshLambertMaterial({
      color: theme.floor.clone().lerp(new THREE.Color(0x000000), 0.05),
      side: THREE.DoubleSide,
    })
    const eastWestCorridor = new THREE.Mesh(geometries.plane, corridorMaterial)
    eastWestCorridor.scale.set(82, 6, 1)
    eastWestCorridor.rotation.x = -Math.PI / 2
    eastWestCorridor.position.set(0, 0.012, 0)
    eastWestCorridor.receiveShadow = true
    sceneDecor.add(eastWestCorridor)
    const northSouthCorridor = new THREE.Mesh(geometries.plane, corridorMaterial)
    northSouthCorridor.scale.set(6, 48, 1)
    northSouthCorridor.rotation.x = -Math.PI / 2
    northSouthCorridor.position.set(0, 0.013, -7)
    northSouthCorridor.receiveShadow = true
    sceneDecor.add(northSouthCorridor)
    let labelEntries: Array<{ sprite: THREE.Sprite; text: string; options: LabelOptions; facility?: boolean; clickable?: boolean }> = []

    const drawMoodFace = (context: CanvasRenderingContext2D, cx: number, cy: number, mood: PresenceMood, ink: string) => {
      context.strokeStyle = ink
      context.lineWidth = 1.4
      context.beginPath()
      context.arc(cx, cy, 6.4, 0, Math.PI * 2)
      context.stroke()
      context.fillStyle = ink
      if (mood === "tired") {
        context.fillRect(cx - 3.6, cy - 2.2, 2.6, 1.2)
        context.fillRect(cx + 1, cy - 2.2, 2.6, 1.2)
      } else {
        context.beginPath()
        context.arc(cx - 2.2, cy - 1.6, 0.9, 0, Math.PI * 2)
        context.fill()
        context.beginPath()
        context.arc(cx + 2.2, cy - 1.6, 0.9, 0, Math.PI * 2)
        context.fill()
      }
      context.beginPath()
      if (mood === "good") context.arc(cx, cy + 0.4, 3, 0.15 * Math.PI, 0.85 * Math.PI)
      else if (mood === "normal") {
        context.moveTo(cx - 2.6, cy + 2.4)
        context.lineTo(cx + 2.6, cy + 2.4)
      } else if (mood === "tired") context.arc(cx, cy + 4.4, 2.6, 1.15 * Math.PI, 1.85 * Math.PI)
      else context.arc(cx, cy + 2.2, 1.5, 0, Math.PI * 2)
      context.stroke()
    }

    const STATUS_COLORS: Record<string, string> = {
      focus: "#2f9e8f",
      meeting: "#d8924a",
      away: "#9aa7b8",
      busy: "#d4564f",
    }
    const drawLabel = (text: string, options: LabelOptions) => {
      const size = options.size ?? 42
      const weight = options.weight ?? 700
      const pad = options.pad ?? 18
      const color = options.zone ? theme.zones[options.zone] : options.color
      const dpr = Math.min(window.devicePixelRatio, 2)
      const labelCanvas = document.createElement("canvas")
      const context = labelCanvas.getContext("2d")
      if (!context) return { canvas: labelCanvas, width: 1, height: 1 }

      const font = `${weight} ${size}px "Noto Sans KR", system-ui, sans-serif`
      context.font = font
      const moodWidth = options.mood ? 20 : 0
      const width = Math.ceil(context.measureText(text).width + pad * 2 + moodWidth)
      const height = Math.ceil(size * 1.72)
      labelCanvas.width = width * dpr
      labelCanvas.height = height * dpr
      context.scale(dpr, dpr)
      context.globalAlpha = 0.82
      context.fillStyle = theme.panel
      context.beginPath()
      context.roundRect(1, 1, width - 2, height - 2, height / 2)
      context.fill()
      context.globalAlpha = 1
      const dotColor = options.badgeColor ?? color
      if (dotColor) {
        context.fillStyle = dotColor
        context.beginPath()
        context.arc(pad, height / 2, 4, 0, Math.PI * 2)
        context.fill()
      }
      let cursor = pad + 10
      if (options.mood) {
        drawMoodFace(context, cursor + 7, height / 2, options.mood, theme.foreground)
        cursor += 20
      }
      context.fillStyle = theme.foreground
      context.font = font
      context.textBaseline = "middle"
      context.fillText(text, cursor, height / 2 + 1)
      return { canvas: labelCanvas, width, height }
    }

    const drawFacilityLabel = (text: string, options: LabelOptions, clickable: boolean) => {
      const size = options.size ?? 36
      const pad = options.pad ?? 14
      const dpr = Math.min(window.devicePixelRatio, 2)
      const labelCanvas = document.createElement("canvas")
      const context = labelCanvas.getContext("2d")
      if (!context) return { canvas: labelCanvas, width: 1, height: 1 }
      const suffix = clickable ? "  ↗" : ""
      const font = `700 ${size}px "Noto Sans KR", system-ui, sans-serif`
      context.font = font
      const width = Math.ceil(context.measureText(`${text}${suffix}`).width + pad * 2 + 18)
      const height = Math.ceil(size * 1.7)
      labelCanvas.width = width * dpr
      labelCanvas.height = height * dpr
      context.scale(dpr, dpr)
      context.fillStyle = theme.panel
      context.fillRect(1, 1, width - 2, height - 2)
      context.strokeStyle = theme.line
      context.lineWidth = 2
      context.strokeRect(1, 1, width - 2, height - 2)
      context.fillStyle = options.zone ? theme.zones[options.zone] : options.color ?? theme.foreground
      context.fillRect(pad, height / 2 - 5, 10, 10)
      context.fillStyle = theme.foreground
      context.font = font
      context.textBaseline = "middle"
      context.fillText(`${text}${suffix}`, pad + 18, height / 2)
      if (clickable) context.fillRect(pad + 18, height - 9, width - pad * 2 - 18, 2)
      return { canvas: labelCanvas, width, height }
    }

    const textureOf = (labelCanvas: HTMLCanvasElement): THREE.CanvasTexture => {
      const texture = new THREE.CanvasTexture(labelCanvas)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())
      return texture
    }

    const makeLabel = (text: string, options: LabelOptions): THREE.Sprite => {
      const drawing = drawLabel(text, options)
      const material = new THREE.SpriteMaterial({
        map: textureOf(drawing.canvas),
        depthTest: false,
        transparent: true,
      })
      const sprite = new THREE.Sprite(material)
      const scale = (options.scale ?? 1) * 0.0085
      const baseW = drawing.width * scale
      const baseH = drawing.height * scale
      sprite.scale.set(baseW, baseH, 1)
      sprite.userData.baseW = baseW
      sprite.userData.baseH = baseH
      sprite.renderOrder = 20
      labelEntries.push({ sprite, text, options })
      return sprite
    }

    const makeFacilityLabel = (text: string, options: LabelOptions, clickable: boolean): THREE.Sprite => {
      const drawing = drawFacilityLabel(text, options, clickable)
      const material = new THREE.SpriteMaterial({
        map: textureOf(drawing.canvas),
        depthTest: false,
        transparent: true,
      })
      const sprite = new THREE.Sprite(material)
      const scale = (options.scale ?? 1) * 0.0085
      const baseW = drawing.width * scale
      const baseH = drawing.height * scale
      sprite.scale.set(baseW, baseH, 1)
      sprite.userData.baseW = baseW
      sprite.userData.baseH = baseH
      sprite.renderOrder = 12
      labelEntries.push({ sprite, text, options, facility: true, clickable })
      return sprite
    }

    let topLabelMinSizeCount = 0
    const roomFlag = (room: Room, parent: THREE.Object3D) => {
      const accent = accentOf(room.path)
      const font = '700 86px "Noto Sans KR", system-ui, sans-serif'
      const measureCanvas = document.createElement("canvas")
      const measureContext = measureCanvas.getContext("2d")
      if (!measureContext) return null
      measureContext.font = font
      const measuredWidth = measureContext.measureText(room.title).width
      const width = THREE.MathUtils.clamp((measuredWidth + 56) / 170, 2, 5.2)
      const height = 0.9
      const depth = 0.9

      const baseCanvas = (size: number) => {
        const canvas = document.createElement("canvas")
        canvas.width = size
        canvas.height = size === 192 ? 192 : 512
        const context = canvas.getContext("2d")
        if (!context) return null
        context.fillStyle = "#ffffff"
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.strokeStyle = accent
        context.lineWidth = 10
        context.strokeRect(5, 5, canvas.width - 10, canvas.height - 10)
        context.fillStyle = accent
        context.font = font
        context.textAlign = "center"
        context.textBaseline = "middle"
        return { canvas, context }
      }
      const drawFitted = (context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, rotation = 0) => {
        const textWidth = context.measureText(text).width
        const scaleX = Math.min(1, maxWidth / textWidth)
        context.save()
        context.translate(x, y)
        context.rotate(rotation)
        context.scale(scaleX, 1)
        context.fillText(text, 0, 0)
        context.restore()
      }

      const frontDrawing = baseCanvas(512)
      const sideDrawing = baseCanvas(192)
      const topDrawing = baseCanvas(512)
      if (!frontDrawing || !sideDrawing || !topDrawing) return null
      frontDrawing.canvas.height = 192
      frontDrawing.context.fillStyle = "#ffffff"
      frontDrawing.context.fillRect(0, 0, 512, 192)
      frontDrawing.context.strokeStyle = accent
      frontDrawing.context.lineWidth = 10
      frontDrawing.context.strokeRect(5, 5, 502, 182)
      frontDrawing.context.fillStyle = accent
      frontDrawing.context.font = font
      frontDrawing.context.textAlign = "center"
      frontDrawing.context.textBaseline = "middle"
      drawFitted(frontDrawing.context, room.title, 256, 98, 456)

      const words = room.title.split(" ")
      const wrapSide = sideDrawing.context.measureText(room.title).width > 136 && words.length > 1
      const sideLines = wrapSide
        ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")]
        : [room.title]
      sideLines.forEach((line, index) => {
        const y = 96 + (index - (sideLines.length - 1) / 2) * 78
        drawFitted(sideDrawing.context, line, 96, y, 156)
      })
      let topFontSize = 86
      while (topFontSize > 44) {
        topDrawing.context.font = `700 ${topFontSize}px "Noto Sans KR", system-ui, sans-serif`
        if (topDrawing.context.measureText(room.title).width <= 456) break
        topFontSize = Math.max(44, topFontSize - 4)
      }
      topDrawing.context.font = `700 ${topFontSize}px "Noto Sans KR", system-ui, sans-serif`
      topDrawing.context.fillText(room.title, 256, 256)
      if (topFontSize === 44) topLabelMinSizeCount += 1

      const group = furnitureGroup(parent, -room.w / 2 + 1.4, -room.d / 2 + 1.4)
      cylinder(0.3, 0.1, materials.metal, 0, 0.05, 0, group)
      cylinder(0.06, 4.4, accentMaterialOf(room.path), 0, 2.2, 0, group)
      const shade = new THREE.Mesh(geometries.plane, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12, depthWrite: false }))
      shade.scale.set(width * 0.8, depth * 2.4, 1)
      shade.rotation.x = -Math.PI / 2
      shade.position.set(0, 0.032, 0)
      group.add(shade)

      const frontMaterial = new THREE.MeshBasicMaterial({ map: textureOf(frontDrawing.canvas) })
      const sideMaterial = new THREE.MeshBasicMaterial({ map: textureOf(sideDrawing.canvas) })
      const topMaterial = new THREE.MeshBasicMaterial({ map: textureOf(topDrawing.canvas) })
      const bottomMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).lerp(new THREE.Color(0x000000), 0.3) })
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        [sideMaterial, sideMaterial, topMaterial, bottomMaterial, frontMaterial, frontMaterial],
      )
      sign.position.y = 3.9
      sign.castShadow = false
      sign.userData = { kind: "room", id: room.path }
      group.add(sign)

      const glow = new THREE.Mesh(
        geometries.plane,
        new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.18, depthWrite: false }),
      )
      glow.scale.set(width * 1.6, depth * 1.6, 1)
      glow.rotation.x = -Math.PI / 2
      glow.position.y = 3.4
      glow.castShadow = false
      group.add(glow)
      return { group, sign }
    }

    const pickables: THREE.Object3D[] = []
    const roomGroups = new Map<string, {
      room: Room
      group: THREE.Group
      flag: THREE.Group | null
      facilities: THREE.Sprite[]
      objects: THREE.Object3D[]
      lighting: {
        beamMaterial: THREE.MeshBasicMaterial
        poolMaterial: THREE.MeshBasicMaterial
      }
    }>()
    const zoneMaterials: Array<{ room: Room; carpet: THREE.MeshLambertMaterial; baseColor: THREE.Color }> = []

    const buildDesk = (parent: THREE.Object3D, x: number, z: number) => {
      box(2.3, 0.1, 1.15, materials.desk, x, 0.74, z, parent)
      roundEdge(parent, 2.3, 0.05, materials.desk, x, 0.74, z + 0.575)
      box(0.1, 0.72, 1, materials.metal, x - 1.05, 0.36, z, parent)
      box(0.1, 0.72, 1, materials.metal, x + 1.05, 0.36, z, parent)
      box(0.14, 0.3, 0.14, materials.metal, x, 0.94, z - 0.3, parent)
      box(1.2, 0.72, 0.07, materials.metal, x, 1.44, z - 0.3, parent)
      const screen = new THREE.Mesh(geometries.plane, screenMat())
      screen.scale.set(1.08, 0.6, 1)
      screen.position.set(x, 1.44, z - 0.25)
      screen.renderOrder = 1
      parent.add(screen)
    }

    const cylinder = (
      radius: number,
      height: number,
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
      parent: THREE.Object3D,
    ) => {
      const mesh = new THREE.Mesh(geometries.cylinder, material)
      mesh.scale.set(radius, height, radius)
      mesh.position.set(x, y, z)
      mesh.castShadow = true
      parent.add(mesh)
      return mesh
    }

    /** 가로로 누인 원기둥. 가구 모서리를 둥글릴 때 쓴다. */
    const roundEdge = (
      parent: THREE.Object3D,
      length: number,
      radius: number,
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
      alongZ = false,
    ) => {
      const mesh = new THREE.Mesh(geometries.cylinder, material)
      mesh.scale.set(radius, length, radius)
      mesh.position.set(x, y, z)
      if (alongZ) mesh.rotation.x = Math.PI / 2
      else mesh.rotation.z = Math.PI / 2
      mesh.castShadow = true
      mesh.receiveShadow = true
      parent.add(mesh)
      return mesh
    }

    const furnitureGroup = (parent: THREE.Object3D, x: number, z: number, rotation = 0) => {
      const group = new THREE.Group()
      group.position.set(x, 0, z)
      group.rotation.y = rotation
      parent.add(group)
      return group
    }

    const chairSupport = (parent: THREE.Object3D, x: number, z: number, baseRadius = 0.3) => {
      cylinder(0.07, 0.36, materials.dark, x, 0.23, z, parent)
      cylinder(baseRadius, 0.06, materials.dark, x, 0.03, z, parent)
    }

    const cabinet = (parent: THREE.Object3D, x: number, z: number, rotation = 0, height = 1.3) => {
      const group = furnitureGroup(parent, x, z, rotation)
      box(1.5, height, 0.52, materials.metal, 0, height / 2, 0, group)
      box(1.4, 0.06, 0.46, materials.dark, 0, 0.03, 0, group)
      box(1.56, 0.05, 0.56, materials.desk, 0, height + 0.02, 0, group)
      roundEdge(group, 1.56, 0.04, materials.desk, 0, height + 0.02, 0.28)
      for (let index = 0; index < 3; index += 1) box(1.34, 0.025, 0.02, materials.desk, 0, 0.25 + index * 0.34, 0.27, group)
      return group
    }

    const deskUnit = (parent: THREE.Object3D, x: number, z: number, rotation = 0) => {
      const group = furnitureGroup(parent, x, z, rotation)
      buildDesk(group, 0, 0)
      box(0.56, 0.1, 0.54, chairMat(), 0, 0.46, 0.95, group)
      box(0.54, 0.52, 0.09, chairMat(), 0, 0.74, 1.21, group)
      chairSupport(group, 0, 0.95)
      return group
    }

    const sofaSet = (parent: THREE.Object3D, x: number, z: number, rotation = 0) => {
      const group = furnitureGroup(parent, x, z, rotation)
      box(2.3, 0.44, 0.95, sofaMat(), 0, 0.22, 0, group)
      box(2.14, 0.14, 0.82, chairMat(), 0, 0.47, 0.04, group)
      box(2.3, 0.72, 0.18, sofaMat(), 0, 0.6, -0.42, group)
      roundEdge(group, 2.3, 0.09, sofaMat(), 0, 0.96, -0.42)
      box(0.18, 0.64, 0.95, sofaMat(), -1.12, 0.55, 0, group)
      box(0.18, 0.64, 0.95, sofaMat(), 1.12, 0.55, 0, group)
      ;[-1, 1].forEach((sideX) => {
        ;[-0.36, 0.36].forEach((sideZ) => cylinder(0.04, 0.12, materials.dark, sideX, 0.06, sideZ, group))
      })
      return group
    }

    const armchair = (parent: THREE.Object3D, x: number, z: number, rotation = 0) => {
      const group = furnitureGroup(parent, x, z, rotation)
      box(0.9, 0.44, 0.9, sofaMat(), 0, 0.22, 0, group)
      box(0.76, 0.14, 0.78, chairMat(), 0, 0.47, 0.04, group)
      box(0.9, 0.7, 0.18, sofaMat(), 0, 0.59, -0.4, group)
      roundEdge(group, 0.9, 0.09, sofaMat(), 0, 0.94, -0.4)
      box(0.18, 0.6, 0.9, sofaMat(), -0.42, 0.54, 0, group)
      box(0.18, 0.6, 0.9, sofaMat(), 0.42, 0.54, 0, group)
      ;[-0.34, 0.34].forEach((sideX) => {
        ;[-0.34, 0.34].forEach((sideZ) => cylinder(0.04, 0.12, materials.dark, sideX, 0.06, sideZ, group))
      })
      return group
    }

    const coffeeTable = (parent: THREE.Object3D, x: number, z: number) => {
      const group = furnitureGroup(parent, x, z)
      box(1.3, 0.07, 0.7, materials.wood, 0, 0.42, 0, group)
      ;[-0.48, 0, 0.48].forEach((legX) => cylinder(0.04, 0.4, materials.metal, legX, 0.2, 0, group))
      return group
    }

    const plant = (parent: THREE.Object3D, x: number, z: number, size = 1, y = 0) => {
      const group = furnitureGroup(parent, x, z)
      if (y) group.position.y = y
      cylinder(0.3 * size, 0.42 * size, materials.desk, 0, 0.21 * size, 0, group)
      for (let index = 0; index < 6; index += 1) {
        const angle = index / 6 * Math.PI * 2
        const leaf = new THREE.Mesh(geometries.ico, materials.green)
        leaf.scale.set(0.22 * size, (0.28 + index % 2 * 0.08) * size, 0.22 * size)
        leaf.position.set(Math.cos(angle) * 0.22 * size, (0.8 + index % 2 * 0.2) * size, Math.sin(angle) * 0.22 * size)
        leaf.castShadow = true
        group.add(leaf)
      }
      return group
    }

    const whiteboard = (parent: THREE.Object3D, x: number, z: number, rotation = 0) => {
      const group = furnitureGroup(parent, x, z, rotation)
      box(2.3, 1.4, 0.06, materials.metal, 0, 1.2, 0, group)
      const face = box(2.2, 1.3, 0.02, materials.board, 0, 1.2, 0.04, group)
      face.castShadow = false
      box(0.6, 0.04, 0.1, materials.metal, 0, 0.48, 0.06, group)
      roundEdge(group, 2.3, 0.03, materials.metal, 0, 1.9, 0)
      roundEdge(group, 2.3, 0.03, materials.metal, 0, 0.5, 0)
      return group
    }

    const printer = (parent: THREE.Object3D, x: number, z: number, rotation = 0) => {
      const group = furnitureGroup(parent, x, z, rotation)
      box(1, 0.84, 0.7, materials.metal, 0, 0.42, 0, group)
      box(1.04, 0.1, 0.74, materials.desk, 0, 0.88, 0, group)
      box(0.6, 0.02, 0.4, materials.paper, 0, 0.94, -0.05, group).castShadow = false
      return group
    }

    const waterCooler = (parent: THREE.Object3D, x: number, z: number) => {
      const group = furnitureGroup(parent, x, z)
      box(0.42, 1, 0.42, materials.metal, 0, 0.5, 0, group)
      cylinder(0.2, 0.46, materials.glass, 0, 1.24, 0, group).castShadow = false
      return group
    }

    const boxStack = (parent: THREE.Object3D, x: number, z: number, count = 3) => {
      const group = furnitureGroup(parent, x, z)
      for (let index = 0; index < count; index += 1) {
        const size = 0.56 + (index % 2) * 0.08
        const item = box(size, 0.36, size * 0.8, materials.desk, (index % 2 - 0.5) * 0.12, 0.18 + index * 0.37, 0, group)
        item.rotation.y = (index - 1) * 0.14
      }
      return group
    }

    const labBench = (parent: THREE.Object3D, x: number, z: number, rotation = 0) => {
      const group = furnitureGroup(parent, x, z, rotation)
      box(3, 0.08, 1, materials.desk, 0, 0.88, 0, group)
      box(1.3, 0.8, 0.9, materials.metal, -0.8, 0.44, 0, group)
      box(1.1, 0.8, 0.9, materials.metal, 0.9, 0.44, 0, group)
      box(0.09, 0.44, 0.09, materials.dark, -0.9, 1.18, -0.1, group)
      cylinder(0.055, 0.3, materials.dark, -0.9, 1.42, 0.02, group).rotation.x = 0.35
      return group
    }

    const swatchStand = (parent: THREE.Object3D, x: number, z: number, rotation = 0) => {
      const group = furnitureGroup(parent, x, z, rotation)
      cylinder(0.05, 1.8, materials.dark, -1, 0.9, 0, group)
      cylinder(0.05, 1.8, materials.dark, 1, 0.9, 0, group)
      const bar = cylinder(0.04, 2, materials.metal, 0, 1.75, 0, group)
      bar.rotation.z = Math.PI / 2
      for (let index = 0; index < 9; index += 1) {
        const material = new THREE.MeshLambertMaterial({ color: FABRIC_COLORS[index % FABRIC_COLORS.length] })
        box(0.17, 0.62 + index % 3 * 0.12, 0.02, material, -0.85 + index * 0.21, 1.38, 0, group).castShadow = false
      }
      return group
    }

    const bookshelf = (parent: THREE.Object3D, x: number, z: number, rotation = 0) => {
      const group = furnitureGroup(parent, x, z, rotation)
      box(2.1, 1.8, 0.06, materials.dark, 0, 0.9, -0.18, group)
      cylinder(0.05, 1.8, materials.dark, -1.02, 0.9, 0, group)
      cylinder(0.05, 1.8, materials.dark, 1.02, 0.9, 0, group)
      box(2, 0.06, 0.4, materials.dark, 0, 0.03, 0, group)
      for (let shelf = 0; shelf < 4; shelf += 1) box(2.1, 0.05, 0.42, materials.wood, 0, 0.36 + shelf * 0.44, 0, group)
      return group
    }

    const floorLamp = (parent: THREE.Object3D, x: number, z: number) => {
      const group = furnitureGroup(parent, x, z)
      cylinder(0.22, 0.04, materials.dark, 0, 0.02, 0, group)
      cylinder(0.025, 1.7, materials.dark, 0, 0.85, 0, group)
      const shade = new THREE.Mesh(geometries.cone, materials.amber)
      shade.scale.set(0.28, 0.3, 0.28)
      shade.position.y = 1.78
      shade.rotation.x = Math.PI
      shade.castShadow = false
      group.add(shade)
      return group
    }

    const rug = (parent: THREE.Object3D, x: number, z: number, width: number, depth: number, color: string) => {
      const mesh = new THREE.Mesh(geometries.plane, new THREE.MeshLambertMaterial({ color }))
      mesh.scale.set(width, depth, 1)
      mesh.rotation.x = -Math.PI / 2
      mesh.position.set(x, 0.022, z)
      mesh.receiveShadow = true
      parent.add(mesh)
      return mesh
    }

    const circleRug = (parent: THREE.Object3D, x: number, z: number, radius: number, color: string) => {
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), new THREE.MeshLambertMaterial({ color }))
      mesh.rotation.x = -Math.PI / 2
      mesh.position.set(x, 0.023, z)
      mesh.receiveShadow = true
      parent.add(mesh)
      return mesh
    }

    const meetingTable = (parent: THREE.Object3D, x: number, z: number, seatCount: number) => {
      const group = furnitureGroup(parent, x, z)
      cylinder(1.35, 0.07, materials.desk, 0, 0.74, 0, group)
      cylinder(0.2, 0.72, materials.dark, 0, 0.37, 0, group)
      const seats = new THREE.InstancedMesh(geometries.box, chairMat(), seatCount)
      const backs = new THREE.InstancedMesh(geometries.box, chairMat(), seatCount)
      const dummy = new THREE.Object3D()
      for (let index = 0; index < seatCount; index += 1) {
        const angle = index / seatCount * Math.PI * 2
        dummy.position.set(Math.cos(angle) * 2.05, 0.46, Math.sin(angle) * 2.05)
        dummy.rotation.set(0, -angle + Math.PI / 2, 0)
        dummy.scale.set(0.5, 0.09, 0.5)
        dummy.updateMatrix()
        seats.setMatrixAt(index, dummy.matrix)
        dummy.position.set(Math.cos(angle) * 2.05 + Math.sin(angle) * 0.22, 0.72, Math.sin(angle) * 2.05 + Math.cos(angle) * 0.22)
        dummy.scale.set(0.48, 0.46, 0.08)
        dummy.updateMatrix()
        backs.setMatrixAt(index, dummy.matrix)
        chairSupport(group, Math.cos(angle) * 2.05, Math.sin(angle) * 2.05)
      }
      seats.instanceMatrix.needsUpdate = true
      backs.instanceMatrix.needsUpdate = true
      seats.castShadow = true
      backs.castShadow = true
      group.add(seats, backs)
      return group
    }

    const fabricRack = (parent: THREE.Object3D, x: number, z: number, rotation = 0) => {
      const group = furnitureGroup(parent, x, z, rotation)
      for (const side of [-1.6, 1.6]) {
        box(0.09, 2.3, 0.09, materials.dark, side, 1.15, -0.4, group)
        box(0.09, 2.3, 0.09, materials.dark, side, 1.15, 0.4, group)
      }
      for (let shelf = 0; shelf < 3; shelf += 1) box(3.2, 0.06, 0.9, materials.metal, 0, 0.5 + shelf * 0.78, 0, group)
      return group
    }

    const serverRack = (parent: THREE.Object3D, x: number, z: number, rotation = 0) => {
      const group = furnitureGroup(parent, x, z, rotation)
      box(1, 2, 0.8, materials.dark, 0, 1, 0, group)
      box(0.88, 1.86, 0.03, chairMat(), 0, 1, 0.41, group)
      return group
    }

    const displayPedestal = (parent: THREE.Object3D, x: number, z: number) => {
      box(1.1, 0.06, 1.1, materials.dark, x, 0.03, z, parent)
      box(1.1, 0.9, 1.1, materials.board, x, 0.45, z, parent)
      box(0.72, 0.1, 0.72, materials.wood, x, 0.95, z, parent)
    }

    const underConstruction = (parent: THREE.Object3D, x: number, z: number) => {
      const group = furnitureGroup(parent, x, z)
      for (let index = 0; index < 3; index += 1) {
        const cone = new THREE.Mesh(geometries.cone, new THREE.MeshLambertMaterial({ color: 0xdd7733 }))
        cone.scale.set(0.22, 0.6, 0.22)
        cone.position.set(-0.8 + index * 0.8, 0.3, index % 2 ? 0.3 : -0.3)
        cone.castShadow = true
        group.add(cone)
      }
      boxStack(group, 1.6, -0.6, 2)
      return group
    }

    const zoneHeights: Record<string, number> = {
      "/warehouse": 3,
      "/setting": 2.4,
    }

    const roomFloorColor = (room: Room) => {
      return theme.floor.clone().lerp(new THREE.Color(accentOf(room.path)), 0.04)
    }

    const addRoomWalls = (room: Room, group: THREE.Group, wallHeight: number) => {
      const thickness = 0.2
      const roomGlassMaterial = materials.glass.clone()
      const wallSegment = (side: "north" | "south" | "east" | "west", width: number, depth: number, x: number, z: number) => {
        box(width, 0.35, depth, materials.wall, x, 0.175, z, group)
        const glass = box(width, wallHeight - 0.35, depth, roomGlassMaterial, x, (wallHeight + 0.35) / 2, z, group)
        glass.castShadow = false
        glass.renderOrder = 3
      }
      const sides: Array<"north" | "south" | "east" | "west"> = ["north", "south", "east", "west"]
      sides.filter((side) => side !== room.entrance).forEach((side) => {
        if (side === "north" || side === "south") {
          const northZ = room.path === "/setting" ? room.d / 2 : -room.d / 2
          const southZ = room.path === "/setting" ? -room.d / 2 : room.d / 2
          wallSegment(side, room.w, thickness, 0, side === "north" ? northZ : southZ)
        } else {
          wallSegment(side, thickness, room.d, side === "west" ? -room.w / 2 : room.w / 2, 0)
        }
      })
    }

    const addInstanced = (
      parent: THREE.Object3D,
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      transforms: Array<{ position: [number, number, number]; scale: [number, number, number]; rotation?: [number, number, number]; color?: string }>,
      castShadow = false,
    ) => {
      const mesh = new THREE.InstancedMesh(geometry, material, transforms.length)
      const dummy = new THREE.Object3D()
      transforms.forEach((transform, index) => {
        dummy.position.set(...transform.position)
        dummy.scale.set(...transform.scale)
        dummy.rotation.set(...(transform.rotation ?? [0, 0, 0]))
        dummy.updateMatrix()
        mesh.setMatrixAt(index, dummy.matrix)
        if (transform.color) mesh.setColorAt(index, new THREE.Color(transform.color))
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.castShadow = castShadow
      mesh.receiveShadow = true
      parent.add(mesh)
      return mesh
    }
    const addWarehouseRolls = (parent: THREE.Object3D) => {
      const transforms: Array<{ position: [number, number, number]; scale: [number, number, number]; rotation: [number, number, number]; color: string }> = []
      WAREHOUSE_RACKS.forEach(([rackX, rackZ], rackIndex) => {
        for (let shelf = 0; shelf < 3; shelf += 1) {
          for (let roll = 0; roll < 7; roll += 1) {
            const seed = rackIndex * 23 + shelf * 7 + roll
            const upright = seed % 5 === 0
            const length = ROLL_LENGTHS[seed % ROLL_LENGTHS.length]
            transforms.push({
              position: [rackX - 1.35 + roll * 0.45, upright ? 0.53 + length / 2 + shelf * 0.78 : 0.7 + shelf * 0.78, rackZ],
              scale: [0.15, upright ? 0.6 : length, 0.15],
              rotation: upright ? [0, 0, 0] : [Math.PI / 2, 0, 0],
              color: FABRIC_PALETTE[seed % FABRIC_PALETTE.length],
            })
          }
        }
      })
      addInstanced(parent, geometries.cylinder, new THREE.MeshLambertMaterial({ color: 0xffffff }), transforms, true)
    }

    const warehouseZoneSign = (parent: THREE.Object3D, text: string, x: number, z: number) => {
      const canvas = document.createElement("canvas")
      canvas.width = 256
      canvas.height = 64
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, 256, 64)
      ctx.strokeStyle = accentOf("/warehouse")
      ctx.lineWidth = 6
      ctx.strokeRect(3, 3, 250, 58)
      ctx.fillStyle = accentOf("/warehouse")
      ctx.font = "700 36px system-ui, sans-serif"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(text, 128, 34)
      const group = furnitureGroup(parent, x, z)
      cylinder(0.05, 2, materials.metal, 0, 1, 0, group)
      const face = new THREE.Mesh(geometries.plane, new THREE.MeshBasicMaterial({ map: textureOf(canvas), side: THREE.DoubleSide }))
      face.scale.set(1.6, 0.4, 1)
      face.position.set(0, 2.1, 0)
      face.castShadow = false
      group.add(face)
    }

    const neonSign = (text: string, color: string, x: number, y: number, z: number, facing: number) => {
      const canvas = document.createElement("canvas")
      canvas.width = 1280
      canvas.height = 256
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.clearRect(0, 0, 1280, 256)
      ctx.font = "700 132px system-ui, sans-serif"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.shadowColor = color
      ctx.shadowBlur = 40
      ctx.strokeStyle = color
      ctx.lineWidth = 6
      ctx.strokeText(text, 640, 132)
      ctx.fillStyle = color
      for (let pass = 0; pass < 5; pass += 1) ctx.fillText(text, 640, 132)
      ctx.shadowBlur = 0
      ctx.globalAlpha = 0.6
      ctx.fillStyle = "#ffffff"
      ctx.fillText(text, 640, 132)
      ctx.globalAlpha = 1
      const group = furnitureGroup(sceneDecor, x, z, facing)
      group.position.y = y
      box(9.5, 1.9, 0.2, materials.dark, 0, 0, 0, group)
      box(9.5, 0.12, 0.3, materials.dark, 0, -1.01, 0, group)
      ;[-4.75, 4.75].forEach((side) => cylinder(0.1, 1.9, materials.dark, side, 0, 0, group))
      const faceMaterial = new THREE.MeshBasicMaterial({ map: textureOf(canvas), transparent: true })
      const frontFace = new THREE.Mesh(geometries.plane, faceMaterial)
      frontFace.scale.set(9.3, 1.8, 1)
      frontFace.position.set(0, 0, 0.09)
      frontFace.castShadow = false
      group.add(frontFace)
      const backFace = new THREE.Mesh(geometries.plane, faceMaterial)
      backFace.scale.set(9.3, 1.8, 1)
      backFace.position.set(0, 0, -0.09)
      backFace.rotation.y = Math.PI
      backFace.castShadow = false
      group.add(backFace)
    }

    const tensileTester = (parent: THREE.Object3D, x: number, z: number, rotation = 0) => {
      const group = furnitureGroup(parent, x, z, rotation)
      box(0.9, 0.7, 1.4, materials.metal, 0, 0.35, 0, group)
      ;[-0.28, 0.28].forEach((side) => cylinder(0.05, 1.8, materials.dark, side, 1.6, 0, group))
      box(0.8, 0.12, 0.3, materials.dark, 0, 1.9, 0, group)
      box(0.46, 0.66, 0.04, screenOf("line"), 0, 1.25, 0.72, group).castShadow = false
      return group
    }

    const microscopeBench = (parent: THREE.Object3D, x: number, z: number, rotation = 0) => {
      const group = furnitureGroup(parent, x, z, rotation)
      box(1.2, 0.75, 0.75, materials.wood, 0, 0.38, 0, group)
      cylinder(0.22, 0.08, materials.dark, -0.2, 0.79, 0, group)
      const tube = new THREE.Mesh(geometries.cylinder, materials.metal)
      tube.scale.set(0.07, 0.52, 0.07)
      tube.position.set(-0.2, 1.08, -0.08)
      tube.rotation.x = 0.35
      group.add(tube)
      box(0.46, 0.34, 0.04, screenOf("grid"), 0.35, 1.05, 0, group).castShadow = false
      return group
    }

    const climateChamber = (parent: THREE.Object3D, x: number, z: number, rotation = 0) => {
      const group = furnitureGroup(parent, x, z, rotation)
      box(1.2, 1.9, 0.9, materials.metal, 0, 0.95, 0, group)
      const window = box(0.9, 0.8, 0.05, materials.glass, 0, 1.35, 0.46, group)
      window.castShadow = false
      ;[-0.25, 0.25].forEach((side) => box(0.3, 0.07, 0.06, materials.dark, side, 0.62, 0.46, group))
      box(0.34, 0.2, 0.03, screenOf("chart"), 0, 1.78, 0.46, group).castShadow = false
      return group
    }

    const balanceBench = (parent: THREE.Object3D, x: number, z: number, rotation = 0) => {
      const group = furnitureGroup(parent, x, z, rotation)
      box(0.9, 0.75, 0.6, materials.wood, 0, 0.38, 0, group)
      box(0.4, 0.08, 0.4, materials.dark, 0, 0.79, 0, group)
      const cover = box(0.4, 0.35, 0.4, materials.glass, 0, 1.01, 0, group)
      cover.castShadow = false
      return group
    }

    const fabricHangerRail = (parent: THREE.Object3D, x: number, z: number, rotation = 0) => {
      const group = furnitureGroup(parent, x, z, rotation)
      ;[-2.1, 2.1].forEach((side) => cylinder(0.05, 1.9, materials.metal, side, 0.95, 0, group))
      cylinder(0.04, 4.2, materials.metal, 0, 1.88, 0, group).rotation.z = Math.PI / 2
      const swatches = Array.from({ length: 12 }, (_, index) => ({
        position: [-1.98 + index * 0.36, 1.4, 0] as [number, number, number],
        scale: [0.34, 0.9, 0.03] as [number, number, number],
        color: FABRIC_PALETTE[index % FABRIC_PALETTE.length],
      }))
      addInstanced(group, geometries.box, new THREE.MeshLambertMaterial({ color: 0xffffff }), swatches, true)
      return group
    }

    const colorPaletteBoard = (parent: THREE.Object3D, x: number, z: number, rotation = 0) => {
      const group = furnitureGroup(parent, x, z, rotation)
      box(2.6, 1.6, 0.08, materials.board, 0, 1.6, 0, group)
      const tiles = Array.from({ length: 24 }, (_, index) => ({
        position: [-1.1 + (index % 6) * 0.44, 2.14 - Math.floor(index / 6) * 0.38, 0.06] as [number, number, number],
        scale: [0.36, 0.32, 0.02] as [number, number, number],
        color: FABRIC_PALETTE[index % FABRIC_PALETTE.length],
      }))
      addInstanced(group, geometries.box, new THREE.MeshLambertMaterial({ color: 0xffffff }), tiles)
      return group
    }

    const screenBezel = (parent: THREE.Object3D, width: number, height: number, z: number) => {
      box(width + 0.08, 0.04, 0.04, materials.dark, 0, height / 2 + 0.02, z, parent)
      box(width + 0.08, 0.04, 0.04, materials.dark, 0, -height / 2 - 0.02, z, parent)
      box(0.04, height, 0.04, materials.dark, -width / 2 - 0.02, 0, z, parent)
      box(0.04, height, 0.04, materials.dark, width / 2 + 0.02, 0, z, parent)
    }

    const monitorWall = (parent: THREE.Object3D, x: number, z: number, rotation = 0) => {
      const group = furnitureGroup(parent, x, z, rotation)
      box(7.2, 2.6, 0.12, materials.dark, 0, 2, 0, group)
      const kinds: ScreenKind[] = ["grid", "chart", "grid", "grid", "line", "grid"]
      kinds.forEach((kind, index) => {
        const column = index % 3
        const row = Math.floor(index / 3)
        const panel = new THREE.Mesh(geometries.plane, screenOf(kind))
        panel.scale.set(2.2, 1.1, 1)
        panel.position.set(-2.3 + column * 2.3, 2.6 - row * 1.18, 0.07)
        panel.castShadow = false
        group.add(panel)
        const bezel = furnitureGroup(group, panel.position.x, panel.position.z)
        bezel.position.y = panel.position.y
        screenBezel(bezel, 2.2, 1.1, 0.04)
      })
      return group
    }

    const chartPanel = (parent: THREE.Object3D, x: number, y: number, z: number, kind: ScreenKind, width: number, height: number, rotation = 0) => {
      const group = furnitureGroup(parent, x, z, rotation)
      group.position.y = y
      box(width + 0.1, height + 0.1, 0.07, materials.dark, 0, 0, 0, group)
      const face = new THREE.Mesh(geometries.plane, screenOf(kind))
      face.scale.set(width, height, 1)
      face.position.set(0, 0, 0.05)
      face.castShadow = false
      group.add(face)
      screenBezel(group, width, height, 0.09)
      return group
    }

    const aiCore = (parent: THREE.Object3D, x: number, z: number) => {
      const group = furnitureGroup(parent, x, z)
      const glow = new THREE.MeshLambertMaterial({ color: 0x4aa3d4 })
      const shell = new THREE.Mesh(geometries.cylinder, materials.glass)
      shell.scale.set(0.9, 2.6, 0.9)
      shell.position.y = 1.3
      shell.castShadow = false
      group.add(shell)
      cylinder(0.45, 2.2, materials.dark, 0, 1.1, 0, group)
      ;[0.6, 1.0, 1.4, 1.8, 2.2].forEach((ringY) => {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.84, 28), glow)
        ring.rotation.x = -Math.PI / 2
        ring.position.y = ringY
        ring.castShadow = false
        group.add(ring)
      })
      const kinds: ScreenKind[] = ["line", "chart", "grid"]
      kinds.forEach((kind, index) => {
        const angle = (index - 1) * (Math.PI * 2 / 3)
        chartPanel(group, Math.sin(angle) * 3.2, 1.5, Math.cos(angle) * 3.2, kind, 2.2, 1.2, angle + Math.PI)
      })
      for (let index = 0; index < 4; index += 1) {
        const angle = index / 4 * Math.PI * 2 + Math.PI / 4
        cylinder(0.3, 0.5, chairMat(), Math.sin(angle) * 4.2, 0.25, Math.cos(angle) * 4.2, group)
      }
      ;[3.2, 4.6].forEach((radius) => {
        const circle = new THREE.Mesh(new THREE.RingGeometry(radius - 0.03, radius + 0.03, 48), glow)
        circle.rotation.x = -Math.PI / 2
        circle.position.y = 0.031
        circle.castShadow = false
        group.add(circle)
      })
      return group
    }

    const monthBoard = (parent: THREE.Object3D, x: number, z: number, rotation = 0) => {
      const group = furnitureGroup(parent, x, z, rotation)
      box(3, 2, 0.08, materials.board, 0, 1.7, 0, group)
      const cells = Array.from({ length: 35 }, (_, index) => ({
        position: [-1.26 + (index % 7) * 0.42, 2.44 - Math.floor(index / 7) * 0.38, 0.06] as [number, number, number],
        scale: [0.36, 0.32, 0.015] as [number, number, number],
        color: (index * 11) % 3 === 0 ? accentOf("/calendar") : "#e8eef5",
      }))
      addInstanced(group, geometries.box, new THREE.MeshLambertMaterial({ color: 0xffffff }), cells)
      return group
    }

    const weekRail = (parent: THREE.Object3D, x: number, z: number, rotation = 0) => {
      const group = furnitureGroup(parent, x, z, rotation)
      box(4, 0.5, 0.08, materials.dark, 0, 1.5, 0, group)
      const bars = Array.from({ length: 5 }, (_, index) => ({
        position: [-1.6 + index * 0.8, 1.5, 0.06] as [number, number, number],
        scale: [0.68, 0.34, 0.02] as [number, number, number],
        color: FABRIC_PALETTE[(index * 2) % FABRIC_PALETTE.length],
      }))
      addInstanced(group, geometries.box, new THREE.MeshLambertMaterial({ color: 0xffffff }), bars)
      return group
    }

    const deskIsland = (parent: THREE.Object3D, x: number, z: number, rotation = 0, seatCount = 4) => {
      const island = furnitureGroup(parent, x, z, rotation)
      if (seatCount === 2) {
        deskUnit(island, 0, -0.6, 0)
        deskUnit(island, 0, 0.6, Math.PI)
        box(2.4, 0.45, 0.08, materials.metal, 0, 0.99, 0, island)
        plant(island, 1.8, 0, 0.85)
        plant(island, -0.95, -0.55, 0.38, 0.78)
      } else {
        ;[-1.25, 1.25].forEach((deskX) => {
          deskUnit(island, deskX, -0.6, 0)
          deskUnit(island, deskX, 0.6, Math.PI)
        })
        box(4.9, 0.45, 0.08, materials.metal, 0, 0.99, 0, island)
        box(0.08, 0.45, 2.35, materials.metal, 0, 0.99, 0, island)
        plant(island, 3, 0, 0.85)
        plant(island, -2.1, -0.55, 0.38, 0.78)
      }
      return island
    }

    const benchRow = (parent: THREE.Object3D, x: number, z: number, rotation: number, seats: number) => {
      const group = furnitureGroup(parent, x, z, rotation)
      const length = seats * 1.6
      box(length, 0.09, 1.1, materials.desk, 0, 1.05, 0, group)
      roundEdge(group, length, 0.05, materials.desk, 0, 1.05, 0.55)
      ;[-1, 1].forEach((side) => cylinder(0.12, 1.05, materials.metal, side * (length / 2 - 0.3), 0.52, 0, group))
      box(length, 0.45, 0.07, materials.metal, 0, 1.27, -0.52, group)
      for (let index = 0; index < seats; index += 1) {
        const seatX = (index - (seats - 1) / 2) * 1.6
        box(0.72, 0.46, 0.04, screenMat(), seatX, 1.4, -0.22, group).castShadow = false
        box(0.56, 0.1, 0.54, chairMat(), seatX, 0.46, 0.95, group)
        box(0.54, 0.52, 0.09, chairMat(), seatX, 0.74, 1.21, group)
        chairSupport(group, seatX, 0.95)
        if (index < seats - 1) {
          box(0.06, 0.42, 1.0, materials.metal, seatX + 0.8, 1.26, -0.1, group)
        }
      }
      plant(group, length / 2 - 0.45, -0.3, 0.38, 0.78)
      return group
    }

    const shelfDivider = (parent: THREE.Object3D, x: number, z: number, rotation = 0) => {
      const group = furnitureGroup(parent, x, z, rotation)
      ;[-2.06, 2.06].forEach((side) => cylinder(0.055, 2.0, materials.wood, side, 1.0, 0, group))
      ;[-0.7, 0.7].forEach((side) => box(0.07, 2.0, 0.45, materials.wood, side, 1.0, 0, group))
      box(4.1, 0.06, 0.42, materials.dark, 0, 0.03, 0, group)
      for (let shelf = 0; shelf < 4; shelf += 1) box(4.2, 0.07, 0.45, materials.wood, 0, 0.1 + shelf * 0.62, 0, group)
      const books: Array<{ position: [number, number, number]; scale: [number, number, number]; color: string }> = []
      for (let column = 0; column < 3; column += 1) {
        for (let row = 0; row < 3; row += 1) {
          for (let book = 0; book < 3; book += 1) {
            const slot = (column * 3 + row) * 3 + book
            books.push({
              position: [(column - 1) * 1.38 - 0.3 + book * 0.3, 0.35 + row * 0.62, 0],
              scale: [0.12, 0.42, 0.26],
              color: FABRIC_COLORS[slot % FABRIC_COLORS.length],
            })
          }
        }
      }
      addInstanced(group, geometries.box, new THREE.MeshLambertMaterial({ color: 0xffffff }), books)
      return group
    }

    const partition = (
      parent: THREE.Object3D,
      x: number,
      z: number,
      length: number,
      vertical: boolean,
      accentPath: string,
      rounded = false,
    ) => {
      const width = vertical ? 0.1 : length
      const depth = vertical ? length : 0.1
      box(width, 1.3, depth, materials.wall, x, 0.65, z, parent)
      box(vertical ? 0.05 : length, 0.05, vertical ? length : 0.05, accentMaterialOf(accentPath), x, 1.325, z, parent)
      if (rounded) {
        const offset = length / 2
        const ends = vertical ? [[x, z - offset], [x, z + offset]] : [[x - offset, z], [x + offset, z]]
        ends.forEach(([endX, endZ]) => cylinder(0.05, 1.3, materials.wall, endX, 0.65, endZ, parent))
      }
    }

    const plantRow = (parent: THREE.Object3D, x: number, z: number, count: number, vertical = false) => {
      for (let index = 0; index < count; index += 1) {
        plant(parent, x + (vertical ? 0 : index * 1.6), z + (vertical ? index * 1.6 : 0), PLANT_SIZES[index % PLANT_SIZES.length])
      }
    }

    const arcDesk = (parent: THREE.Object3D, x: number, z: number, rotation = 0) => {
      const group = furnitureGroup(parent, x, z, rotation)
      const start = Math.PI * 0.2
      const length = Math.PI * 0.6
      const outerGeometry = new THREE.CylinderGeometry(2.2, 2.2, 1, 28, 1, true, start, length)
      const innerGeometry = new THREE.CylinderGeometry(1.45, 1.45, 1, 28, 1, true, start, length)
      const topGeometry = new THREE.RingGeometry(1.45, 2.2, 28, 1, start, length)
      const outer = new THREE.Mesh(outerGeometry, materials.wood)
      outer.position.y = 0.5
      outer.castShadow = true
      group.add(outer)
      const innerMaterial = materials.wood.clone()
      innerMaterial.side = THREE.BackSide
      const inner = new THREE.Mesh(innerGeometry, innerMaterial)
      inner.position.y = 0.5
      inner.castShadow = true
      group.add(inner)
      const top = new THREE.Mesh(topGeometry, materials.desk)
      top.rotation.x = -Math.PI / 2
      top.position.y = 1.02
      top.castShadow = true
      group.add(top)
      return group
    }

    const furnishRoom = (room: Room, group: THREE.Group) => {
      if (room.path === "/") {
        arcDesk(group, 9.5, 0, -Math.PI / 2)
        rug(group, -5.5, 0, 9, 5, theme.dark ? "#596273" : "#c7d0df")
        sofaSet(group, -8.5, 0, Math.PI / 2)
        sofaSet(group, -2.5, 0, -Math.PI / 2)
        armchair(group, -5.5, -2.6, Math.PI)
        coffeeTable(group, -5.5, 0)
        plant(group, 0.5, -2.4, 1.2)
      } else if (room.path === "/meta") {
        deskIsland(group, 4, 0.5, Math.PI / 2)
        sofaSet(group, -5, 1.8, Math.PI)
        coffeeTable(group, -5, 0.3)
        armchair(group, -2, 2.6, -Math.PI / 2)
        bookshelf(group, -6, -4.4, 0)
        bookshelf(group, 6, -4.4, 0)
      } else if (room.path === "/development/workspace") {
        deskIsland(group, -8, 0, 0)
        shelfDivider(group, 1, 0, Math.PI / 2)
        benchRow(group, 8, 0, Math.PI / 2, 2)
        monitorWall(group, 0, -4.1)
        ;[-15, -11, -7, 7, 11, 15].forEach((x) => cabinet(group, x, 4.1, Math.PI, 1.8))
        waterCooler(group, 16.5, 3.4)
        plant(group, -16, 3.2)
      } else if (room.path === "/request") {
        deskIsland(group, -4, 0, 0)
        shelfDivider(group, 3, 0, Math.PI / 2)
        fabricHangerRail(group, -4, -4)
        fabricHangerRail(group, 4, -4)
        colorPaletteBoard(group, 7.6, 0, -Math.PI / 2)
        cabinet(group, -7.8, -4.3, 0, 1.8)
        cabinet(group, 7.8, -4.3, 0, 1.8)
        printer(group, 7.5, 4.2, Math.PI)
      } else if (room.path === "/fabric-analysis") {
        ;[[-5, -2.2, 0], [-5, 2.2, Math.PI]].forEach(([x, z, rotation]) => labBench(group, x, z, rotation))
        tensileTester(group, 8.6, -3)
        microscopeBench(group, 8.6, 0)
        climateChamber(group, 8.6, 3, Math.PI)
        balanceBench(group, -8.6, 0, Math.PI / 2)
        addInstanced(group, geometries.cylinder, new THREE.MeshLambertMaterial({ color: 0xffffff }), Array.from({ length: 6 }, (_, index) => ({
          position: [-6.2 + (index % 3) * 1.2, 0.82, index < 3 ? -2.2 : 2.2] as [number, number, number],
          scale: [0.12, 0.05, 0.12] as [number, number, number],
          color: FABRIC_PALETTE[(index * 3) % FABRIC_PALETTE.length],
        })))
        swatchStand(group, -8.8, -2, Math.PI / 2)
        swatchStand(group, -8.8, 2, Math.PI / 2)
        cabinet(group, -8.5, -4.4, 0, 1.8)
        cabinet(group, 8.5, -4.4, 0, 1.8)
        cabinet(group, -6, 4.2, Math.PI, 1.3)
        cabinet(group, 6, 4.2, Math.PI, 1.3)
        plant(group, -8.5, 4.2)
        plant(group, 8.5, 4.2)
      } else if (room.path === "/cost") {
        deskIsland(group, 0, -0.5, Math.PI / 2, 2)
        cabinet(group, -3.8, -3.4)
        plant(group, -3.4, 3.2, 1.1)
      } else if (room.path === "/warehouse") {
        const zoneFloor = (zx: number, width: number, color: string) => {
          const strip = new THREE.Mesh(geometries.plane, new THREE.MeshLambertMaterial({ color }))
          strip.scale.set(width, 7.5, 1)
          strip.rotation.x = -Math.PI / 2
          strip.position.set(zx, 0.03, 0)
          strip.receiveShadow = true
          group.add(strip)
        }
        zoneFloor(-4.4, 17.2, "#eef2f7")
        zoneFloor(8.7, 8.6, "#f5f0e8")
        WAREHOUSE_RACKS.forEach(([rx, rz]) => fabricRack(group, rx, rz))
        addWarehouseRolls(group)
        box(0.2, 1.6, 7.5, materials.wall, 4.3, 0.8, 0, group)
        box(0.06, 0.05, 7.5, accentMaterialOf(room.path), 4.3, 1.63, 0, group).castShadow = false
        warehouseZoneSign(group, "3팀", -4.4, -3.4)
        warehouseZoneSign(group, "1팀", 8.7, -3.4)
        ;[-11, -6, 10.5].forEach((x) => boxStack(group, x, 3.2, 3))
        labBench(group, 1.6, -1.8, 0)
        box(4, 0.04, 0.12, materials.yellow, 0, 0.035, 2.9, group).castShadow = false
        box(4, 0.04, 0.12, materials.yellow, 0, 0.035, 3.5, group).castShadow = false
      } else if (room.path === "/ts") {
        deskIsland(group, -3, 0, Math.PI / 2)
        whiteboard(group, 0, -4.1, 0)
        cabinet(group, -8, -4)
        cabinet(group, 8, -4)
        cabinet(group, -8, 3.5, Math.PI, 1.3)
        cabinet(group, 8, 3.5, Math.PI, 1.3)
      } else if (room.path === "/study") {
        const shelfXs = [-7.5, -2.5, 2.5, 7.5]
        shelfXs.forEach((x) => bookshelf(group, x, -1.2, 0))
        shelfXs.forEach((x) => bookshelf(group, x, 1.2, Math.PI))
        meetingTable(group, 0, 3.2, 6)
        floorLamp(group, -9.5, 3.7)
        floorLamp(group, 9.5, 3.7)
        const books = Array.from({ length: 80 }, (_, index) => ({
          position: [-8.8 + index % 20 * 0.92, 0.62 + Math.floor(index / 20) * 0.52, index % 2 ? -4.45 : 4.45] as [number, number, number],
          scale: [0.09 + index % 3 * 0.025, 0.32 + index % 4 * 0.025, 0.3] as [number, number, number],
          color: FABRIC_COLORS[index % FABRIC_COLORS.length],
        }))
        addInstanced(group, geometries.box, new THREE.MeshLambertMaterial({ color: 0xffffff }), books)
      } else if (room.path === "/protocol") {
        meetingTable(group, 0, 0, 6)
        partition(group, -6.5, 2.5, 5, true, room.path, true)
        partition(group, 5, -3.2, 4, false, room.path, true)
        whiteboard(group, -6, -4.85, 0)
        whiteboard(group, 6, -4.85, 0)
        plant(group, -5.6, 4, 1.1)
      } else if (room.path === "/calendar") {
        meetingTable(group, 0, 0, 6)
        whiteboard(group, 0, 4.4, Math.PI)
        monthBoard(group, -4.3, 0, Math.PI / 2)
        weekRail(group, 0, -4.2)
        plant(group, -3.4, -3.8, 1.1)
      } else if (room.path === "/rdda") {
        partition(group, 0, 4.2, 6, false, room.path, true)
      } else if (room.path === "/setting") {
        const rackPositions = [[-2.6, -2.5], [0, -2.5], [2.6, -2.5], [-2.6, 1.4], [0, 1.4], [2.6, 1.4]]
        rackPositions.forEach(([x, z]) => serverRack(group, x, z))
        cabinet(group, -3.2, 3.4)
        deskUnit(group, 2.2, 3.2, Math.PI)
        const slots = rackPositions.flatMap(([x, z], rackIndex) => Array.from({ length: 9 }, (_, slot) => ({
          position: [x, 0.25 + slot * 0.2, z + 0.43] as [number, number, number],
          scale: [0.8, 0.12, 0.02] as [number, number, number],
          color: slot % 3 === rackIndex % 3 ? "#6f93e6" : "#9aa4b2",
        })))
        addInstanced(group, geometries.box, new THREE.MeshLambertMaterial({ color: 0xffffff }), slots)
      } else if (room.path === "/process-innovation") {
        aiCore(group, 0, 0)
        plant(group, -4.6, 3.6)
        plant(group, 4.6, 3.6)
      }
    }

    const furnishShowroom = (room: Room, group: THREE.Group) => {
      if (room.path === "/trend/macro") {
        const tickerColors = ["#ff4d6a", "#2dd4bf", "#3f7ae0"]
        const panels = Array.from({ length: 24 }, (_, index) => ({
          position: [-2.5 + index % 6, 0.65 + Math.floor(index / 6) * 0.62, -room.d / 2 + 0.12] as [number, number, number],
          scale: [0.9, 0.5, 0.04] as [number, number, number],
          color: tickerColors[index % 3],
        }))
        addInstanced(group, geometries.box, new THREE.MeshBasicMaterial({ color: 0xffffff }), panels)
        chartPanel(group, 10.2, 1.9, -3, "chart", 2.4, 1.5, -Math.PI / 2)
        chartPanel(group, 10.2, 1.9, 0, "line", 2.4, 1.5, -Math.PI / 2)
        chartPanel(group, 10.2, 1.9, 3, "chart", 2.4, 1.5, -Math.PI / 2)
        for (let row = 0; row < 2; row += 1) {
          for (let column = 0; column < 3; column += 1) {
            const desk = furnitureGroup(group, -4.8 + column * 4.8, -2 + row * 4, row === 1 ? Math.PI : 0)
            box(2.4, 0.09, 1, materials.desk, 0, 1.05, 0, desk)
            for (let monitor = 0; monitor < 3; monitor += 1) {
              const screen = box(0.65, 0.42, 0.04, screenMat(), (monitor - 1) * 0.7, 1.38, -0.22 + Math.abs(monitor - 1) * 0.08, desk)
              screen.rotation.y = (monitor - 1) * -0.25
              screen.castShadow = false
            }
          }
        }
      } else if (room.path === "/trend/fabric") {
        const rolls = Array.from({ length: 18 }, (_, index) => ({
          position: [-room.w / 2 + 0.45 + index % 3 * 0.38, 1, -4.7 + Math.floor(index / 3) * 1.8] as [number, number, number],
          scale: [0.16, 2, 0.16] as [number, number, number],
          color: FABRIC_COLORS[index % FABRIC_COLORS.length],
        }))
        addInstanced(group, geometries.cylinder, new THREE.MeshLambertMaterial({ color: 0xffffff }), rolls, true)
        ;[[-4, -1], [0, 2], [4, -1]].forEach(([x, z], index) => {
          displayPedestal(group, x, z)
          for (let layer = 0; layer < 4; layer += 1) box(0.75, 0.08, 0.55, new THREE.MeshLambertMaterial({ color: FABRIC_COLORS[(index + layer) % FABRIC_COLORS.length] }), x, 1.05 + layer * 0.08, z, group).castShadow = false
          const spot = new THREE.Mesh(geometries.cone, materials.amber)
          spot.scale.set(0.25, 0.35, 0.25)
          spot.position.set(x, 2.7, z)
          spot.rotation.x = Math.PI
          spot.castShadow = false
          group.add(spot)
          const lightCore = new THREE.Mesh(geometries.sphere, neonMaterials.trend)
          lightCore.scale.setScalar(0.38)
          lightCore.position.set(x, 2.7, z)
          lightCore.castShadow = false
          group.add(lightCore)
        })
        ;[[-5, 3.5], [0, 4], [5, 3.5]].forEach(([x, z]) => {
          cylinder(0.45, 0.1, materials.dark, x, 0.05, z, group)
          cylinder(0.08, 1.3, materials.metal, x, 0.7, z, group)
          box(0.8, 1.2, 0.45, materials.paper, x, 1.55, z, group)
          const head = new THREE.Mesh(geometries.sphere, materials.paper)
          head.scale.setScalar(0.28)
          head.position.set(x, 2.35, z)
          group.add(head)
        })
        sofaSet(group, 3, 0.5, -Math.PI / 2)
        coffeeTable(group, 0.5, 0.5)
      } else if (room.path === "/trend/portfolio") {
        ;[-2.2, 2.2].forEach((z, wallIndex) => {
          box(6, 2.2, 0.12, materials.wall, 0, 1.1, z, group)
          box(6, 0.12, 0.16, materials.dark, 0, 0.06, z, group)
          for (let index = 0; index < 6; index += 1) {
            const x = -2.5 + index
            box(0.72, 0.92, 0.05, new THREE.MeshLambertMaterial({ color: FABRIC_COLORS[(wallIndex * 6 + index) % FABRIC_COLORS.length] }), x, 1.25, z + 0.09, group).castShadow = false
          }
        })
        ;[[-5.5, -3.7], [-1.8, -3.7], [1.8, 3.7], [5.5, 3.7]].forEach(([x, z]) => displayPedestal(group, x, z))
        box(3.2, 0.48, 0.7, materials.wood, -4.5, 0.24, 0, group)
        box(3.2, 0.48, 0.7, materials.wood, 4.5, 0.24, 0, group)
      } else if (room.path === "/rdda") {
        const screenWidth = room.w * 0.7
        box(screenWidth, 2.2, 0.08, materials.dark, 0, 1.55, -room.d / 2 + 0.11, group).castShadow = false
        neonBox(screenWidth, 0.05, 0.05, neonMaterials.tech, 0, 0.45, -room.d / 2 + 0.17, group)
        neonBox(screenWidth, 0.05, 0.05, neonMaterials.tech, 0, 2.65, -room.d / 2 + 0.17, group)
        neonBox(0.05, 2.2, 0.05, neonMaterials.tech, -screenWidth / 2, 1.55, -room.d / 2 + 0.17, group)
        neonBox(0.05, 2.2, 0.05, neonMaterials.tech, screenWidth / 2, 1.55, -room.d / 2 + 0.17, group)
        const rddaFace = new THREE.Mesh(geometries.plane, screenOf("chart"))
        rddaFace.scale.set(screenWidth - 0.3, 1.9, 1)
        rddaFace.position.set(0, 1.55, -room.d / 2 + 0.17)
        rddaFace.castShadow = false
        group.add(rddaFace)
        chartPanel(group, -6, 1.1, -room.d / 2 + 0.6, "line", 2.6, 1.3)
        chartPanel(group, 6, 1.1, -room.d / 2 + 0.6, "grid", 2.6, 1.3)
        box(1.4, 1.1, 0.8, materials.wood, -7.5, 0.55, -2.8, group)
        const seats = Array.from({ length: 12 }, (_, index) => ({
          position: [-3.75 + index % 4 * 2.5, 0.44, -1.5 + Math.floor(index / 4) * 1.9] as [number, number, number],
          scale: [0.55, 0.1, 0.55] as [number, number, number],
        }))
        const backs = seats.map((seat) => ({ position: [seat.position[0], 0.76, seat.position[2] + 0.27] as [number, number, number], scale: [0.55, 0.52, 0.09] as [number, number, number] }))
        const bases = seats.map((seat) => ({ position: [seat.position[0], 0.025, seat.position[2]] as [number, number, number], scale: [0.2, 0.05, 0.2] as [number, number, number] }))
        const posts = seats.map((seat) => ({
          position: [seat.position[0], 0.22, seat.position[2]] as [number, number, number],
          scale: [0.05, 0.38, 0.05] as [number, number, number],
        }))
        addInstanced(group, geometries.box, chairMat(), seats, true)
        addInstanced(group, geometries.box, chairMat(), backs, true)
        addInstanced(group, geometries.cylinder, materials.dark, posts, true)
        addInstanced(group, geometries.cylinder, materials.dark, bases, true)
      }
    }

    const makeRoomShape = (room: Room, width: number, depth: number, inset: number) => {
      const shape = new THREE.Shape()
      const left = -width / 2 + inset
      const right = width / 2 - inset
      const bottom = -depth / 2 + inset
      const top = depth / 2 - inset

      if (room.shape === "round") {
        const radius = Math.min(2 - inset, (right - left) / 2, (top - bottom) / 2)
        shape.moveTo(left + radius, bottom)
        shape.lineTo(right - radius, bottom)
        shape.quadraticCurveTo(right, bottom, right, bottom + radius)
        shape.lineTo(right, top - radius)
        shape.quadraticCurveTo(right, top, right - radius, top)
        shape.lineTo(left + radius, top)
        shape.quadraticCurveTo(left, top, left, top - radius)
        shape.lineTo(left, bottom + radius)
        shape.quadraticCurveTo(left, bottom, left + radius, bottom)
      } else if (room.shape === "stadium") {
        const radius = (top - bottom) / 2
        const leftCenter = left + radius
        const rightCenter = right - radius
        shape.moveTo(leftCenter, bottom)
        shape.lineTo(rightCenter, bottom)
        shape.absarc(rightCenter, 0, radius, -Math.PI / 2, Math.PI / 2, false)
        shape.lineTo(leftCenter, top)
        shape.absarc(leftCenter, 0, radius, Math.PI / 2, Math.PI * 1.5, false)
      } else if (room.shape === "chamfer") {
        const cut = 2 - inset
        shape.moveTo(left, bottom)
        shape.lineTo(right - cut, bottom)
        shape.lineTo(right, bottom + cut)
        shape.lineTo(right, top)
        shape.lineTo(left + cut, top)
        shape.lineTo(left, top - cut)
      } else if (room.shape === "ell") {
        const notchWidth = room.w * 0.3
        const notchDepth = room.d * 0.4
        const cutX = -width / 2 + notchWidth + inset
        if (room.path === "/trend/fabric") {
          const cutY = -depth / 2 + notchDepth + inset
          shape.moveTo(left, cutY)
          shape.lineTo(cutX, cutY)
          shape.lineTo(cutX, bottom)
          shape.lineTo(right, bottom)
          shape.lineTo(right, top)
          shape.lineTo(left, top)
        } else {
          const cutY = depth / 2 - notchDepth - inset
          shape.moveTo(left, bottom)
          shape.lineTo(right, bottom)
          shape.lineTo(right, top)
          shape.lineTo(cutX, top)
          shape.lineTo(cutX, cutY)
          shape.lineTo(left, cutY)
        }
      } else {
        shape.moveTo(left, bottom)
        shape.lineTo(right, bottom)
        shape.lineTo(right, top)
        shape.lineTo(left, top)
      }

      shape.closePath()
      return shape
    }

    const createRoomLighting = (room: Room, parent: THREE.Object3D) => {
      const beamMaterial = new THREE.MeshBasicMaterial({
        color: 0xfbfdff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      const beam = new THREE.Mesh(
        new THREE.ConeGeometry(Math.min(room.w, room.d) * 0.42, 7.2, 24, 1, true),
        beamMaterial,
      )
      beam.position.y = 3.6
      beam.castShadow = false
      beam.receiveShadow = false
      beam.renderOrder = 3
      parent.add(beam)

      const poolMaterial = new THREE.MeshBasicMaterial({
        color: 0xfffdf9,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
      const pool = new THREE.Mesh(
        new THREE.ShapeGeometry(makeRoomShape(room, room.w * 0.92, room.d * 0.92, 0)),
        poolMaterial,
      )
      pool.rotation.x = -Math.PI / 2
      pool.position.y = 0.034
      pool.castShadow = false
      pool.renderOrder = 2
      parent.add(pool)


      return { beamMaterial, poolMaterial }
    }

    const patternCanvas = (pattern: FloorPattern) => {
      const canvas = document.createElement("canvas")
      canvas.width = 128
      canvas.height = 128
      const context = canvas.getContext("2d")
      if (!context) return canvas
      context.clearRect(0, 0, 128, 128)
      context.strokeStyle = "#ffffff"
      context.fillStyle = "#ffffff"
      if (pattern === "grid") {
        context.lineWidth = 1
        for (let position = 0; position <= 128; position += 32) {
          context.beginPath()
          context.moveTo(position + 0.5, 0)
          context.lineTo(position + 0.5, 128)
          context.moveTo(0, position + 0.5)
          context.lineTo(128, position + 0.5)
          context.stroke()
        }
      } else if (pattern === "stripe") {
        context.lineWidth = 2
        for (let offset = -128; offset <= 128; offset += 16) {
          context.beginPath()
          context.moveTo(offset, 0)
          context.lineTo(offset + 128, 128)
          context.stroke()
        }
      } else if (pattern === "dot") {
        for (let x = 12; x < 128; x += 24) {
          for (let y = 12; y < 128; y += 24) {
            context.beginPath()
            context.arc(x, y, 2, 0, Math.PI * 2)
            context.fill()
          }
        }
      } else if (pattern === "herringbone") {
        context.lineWidth = 1
        for (let row = 0; row * 16 <= 128; row += 1) {
          const offset = row % 2 ? 16 : 0
          for (let column = -1; column * 32 + offset <= 128; column += 1) {
            context.strokeRect(column * 32 + offset + 0.5, row * 16 + 0.5, 32, 16)
          }
        }
      }
      return canvas
    }

    const patternTextures = new Map<FloorPattern, THREE.CanvasTexture>()
    const patternTextureOf = (pattern: FloorPattern) => {
      if (pattern === "plain") return null
      const existing = patternTextures.get(pattern)
      if (existing) return existing
      const texture = new THREE.CanvasTexture(patternCanvas(pattern))
      texture.wrapS = THREE.RepeatWrapping
      texture.wrapT = THREE.RepeatWrapping
      patternTextures.set(pattern, texture)
      return texture
    }

    addOuterWall(82, 0.4, 0, -31)
    addOuterWall(0.4, 58, -41, -2)
    addOuterWall(82, 0.4, 0, 27)
    addOuterWall(0.4, 58, 41, -2)

    SECTION_SIGNS.forEach((sign) => neonSign(sign.text, SECTION_TONE[sign.tone].chair, sign.x, 3.6, sign.z, sign.facing))

    ROOMS.forEach((room) => {
      const group = new THREE.Group()
      group.position.set(room.x, 0, room.z)
      scene.add(group)
      const floorWidth = room.w * 0.94
      const floorDepth = room.d * 0.94
      const edgeFloor = new THREE.Mesh(
        new THREE.ShapeGeometry(makeRoomShape(room, floorWidth, floorDepth, 0)),
        accentMaterialOf(room.path).clone(),
      )
      edgeFloor.material.side = THREE.DoubleSide
      edgeFloor.rotation.x = -Math.PI / 2
      edgeFloor.position.y = 0.02
      edgeFloor.receiveShadow = true
      group.add(edgeFloor)
      const carpetMaterial = new THREE.MeshLambertMaterial({
        color: roomFloorColor(room),
        side: THREE.DoubleSide,
      })
      const floor = new THREE.Mesh(
        new THREE.ShapeGeometry(makeRoomShape(room, floorWidth, floorDepth, 0.08)),
        carpetMaterial,
      )
      floor.rotation.x = -Math.PI / 2
      floor.position.y = 0.025
      floor.receiveShadow = true
      group.add(floor)
      if (room.path !== "/warehouse" && room.path !== "/setting") {
        const halfW = room.w * 0.31
        const halfD = room.d * 0.31
        const carpetShape = new THREE.Shape()
        if (room.shape === "round" || room.shape === "stadium") {
          carpetShape.absellipse(0, 0, halfW, halfD, 0, Math.PI * 2, false, 0)
        } else {
          const radius = 0.6
          carpetShape.moveTo(-halfW + radius, -halfD)
          carpetShape.lineTo(halfW - radius, -halfD)
          carpetShape.quadraticCurveTo(halfW, -halfD, halfW, -halfD + radius)
          carpetShape.lineTo(halfW, halfD - radius)
          carpetShape.quadraticCurveTo(halfW, halfD, halfW - radius, halfD)
          carpetShape.lineTo(-halfW + radius, halfD)
          carpetShape.quadraticCurveTo(-halfW, halfD, -halfW, halfD - radius)
          carpetShape.lineTo(-halfW, -halfD + radius)
          carpetShape.quadraticCurveTo(-halfW, -halfD, -halfW + radius, -halfD)
        }
        const carpetGeometry = new THREE.ShapeGeometry(carpetShape)
        const carpet = new THREE.Mesh(
          carpetGeometry,
          new THREE.MeshLambertMaterial({
            color: new THREE.Color(accentOf(room.path)).lerp(new THREE.Color(0xffffff), 0.88),
            side: THREE.DoubleSide,
          }),
        )
        carpet.rotation.x = -Math.PI / 2
        carpet.position.y = 0.028
        carpet.receiveShadow = true
        group.add(carpet)
        const carpetBase = patternTextureOf(SECTION_TONE[room.zone].carpet)
        if (carpetBase) {
          const carpetTexture = carpetBase.clone()
          carpetTexture.needsUpdate = true
          carpetTexture.repeat.set(0.5, 0.5)
          const overlay = new THREE.Mesh(
            carpetGeometry,
            new THREE.MeshBasicMaterial({ map: carpetTexture, color: accentOf(room.path), transparent: true, opacity: 0.08, depthWrite: false }),
          )
          overlay.rotation.x = -Math.PI / 2
          overlay.position.y = 0.029
          overlay.renderOrder = 1
          group.add(overlay)
        }
      }
      const wallHeight = zoneHeights[room.path]
      if (wallHeight) addRoomWalls(room, group, wallHeight)
      zoneMaterials.push({ room, carpet: carpetMaterial, baseColor: carpetMaterial.color.clone() })
      activeZone = room.zone
      toneRoomPath = room.path
      furnishRoom(room, group)
      furnishShowroom(room, group)
      const lighting = createRoomLighting(room, group)
      const flag = roomFlag(room, group)
      if (flag) pickables.push(flag.sign)
      const facilityLabels: THREE.Sprite[] = []
      META_FACILITIES.filter((facility) => facility.roomPath === room.path).forEach((facility) => {
        const label = makeFacilityLabel(facility.name, { zone: room.zone, size: 34 }, facility.path !== null)
        label.position.set(...facility.position)
        label.visible = false
        label.userData = { ...label.userData, kind: "facility", id: facility.name, path: facility.path }
        group.add(label)
        facilityLabels.push(label)

        if (facility.path) {
          const hit = new THREE.Mesh(geometries.box, new THREE.MeshBasicMaterial({ visible: false }))
          hit.scale.set(...facility.hitSize)
          hit.position.set(facility.position[0], facility.hitSize[1] / 2, facility.position[2])
          hit.visible = false
          hit.userData = { kind: "facility", id: facility.name, path: facility.path }
          group.add(hit)
          pickables.push(hit, label)
        }
      })
      const objectNodes: THREE.Object3D[] = []
      META_OBJECTS.filter((entry) => entry.roomPath === room.path).forEach((entry) => {
        const objectHit = new THREE.Mesh(geometries.box, new THREE.MeshBasicMaterial({ visible: false }))
        objectHit.scale.set(...entry.hitSize)
        objectHit.position.set(...entry.position)
        objectHit.visible = false
        objectHit.userData = { kind: "object", id: entry.id }
        group.add(objectHit)
        pickables.push(objectHit)
        objectNodes.push(objectHit)

        const marker = new THREE.Mesh(geometries.sphere, accentMaterialOf(room.path))
        marker.scale.setScalar(0.18)
        marker.position.set(entry.position[0], entry.position[1] + entry.hitSize[1] / 2 + 0.3, entry.position[2])
        marker.visible = false
        marker.castShadow = false
        group.add(marker)
        objectNodes.push(marker)
      })

      const hit = new THREE.Mesh(geometries.box, new THREE.MeshBasicMaterial({ visible: false }))
      hit.scale.set(room.w, 3.6, room.d)
      hit.position.y = 1.8
      hit.userData = { kind: "floor", id: room.path }
      group.add(hit)
      pickables.push(hit)
      roomGroups.set(room.path, { room, group, flag: flag?.group ?? null, facilities: facilityLabels, objects: objectNodes, lighting })
    })

    type BoundaryAxis = "x" | "z"
    interface BoundaryOpening {
      start: number
      end: number
    }
    interface SectionBoundary {
      axis: BoundaryAxis
      fixed: number
      start: number
      end: number
    }

    const mergeOpenings = (openings: BoundaryOpening[], start: number, end: number) => {
      const merged: BoundaryOpening[] = []
      openings
        .map((opening) => ({ start: Math.max(start, opening.start), end: Math.min(end, opening.end) }))
        .filter((opening) => opening.end > opening.start)
        .sort((left, right) => left.start - right.start)
        .forEach((opening) => {
          const previous = merged.at(-1)
          if (previous && opening.start <= previous.end) {
            previous.end = Math.max(previous.end, opening.end)
          } else {
            merged.push({ ...opening })
          }
        })
      return merged
    }

    const COMMON_AREAS: Array<{ x: number; z: number; w: number; d: number }> = [
      { x: 10, z: -7, w: 14, d: 8 },
      { x: 30, z: -7, w: 14, d: 8 },
      { x: -14, z: 18.5, w: 18, d: 11 },
      { x: -10, z: 7, w: 10, d: 8 },
    ]

    const touchesBoundary = (boundary: SectionBoundary, center: number, size: number) =>
      Math.abs(center + size / 2 - boundary.fixed) < 0.01 || Math.abs(center - size / 2 - boundary.fixed) < 0.01

    const boundaryRoom = (boundary: SectionBoundary, midpoint: number) =>
      ROOMS.find((room) => (boundary.axis === "x"
        ? touchesBoundary(boundary, room.z, room.d) && midpoint >= room.x - room.w / 2 && midpoint <= room.x + room.w / 2
        : touchesBoundary(boundary, room.x, room.w) && midpoint >= room.z - room.d / 2 && midpoint <= room.z + room.d / 2))

    const addSectionBoundary = (boundary: SectionBoundary) => {
      const openings: BoundaryOpening[] = [{ start: -5, end: 5 }]
      const addDoor = (center: number) => openings.push({ start: center - 2, end: center + 2 })
      ROOMS.forEach((room) => {
        if (boundary.axis === "x") {
          if (touchesBoundary(boundary, room.z, room.d)) addDoor(room.x)
        } else if (touchesBoundary(boundary, room.x, room.w)) {
          addDoor(room.z)
        }
      })
      COMMON_AREAS.forEach((area) => {
        if (boundary.axis === "x") {
          if (touchesBoundary(boundary, area.z, area.d)) addDoor(area.x)
        } else if (touchesBoundary(boundary, area.x, area.w)) {
          addDoor(area.z)
        }
      })

      const merged = mergeOpenings(openings, boundary.start, boundary.end)
      const wallSegments: BoundaryOpening[] = []
      let cursor = boundary.start
      merged.forEach((opening) => {
        if (opening.start > cursor) wallSegments.push({ start: cursor, end: opening.start })
        cursor = Math.max(cursor, opening.end)
      })
      if (cursor < boundary.end) wallSegments.push({ start: cursor, end: boundary.end })

      wallSegments.forEach((segment) => {
        const length = segment.end - segment.start
        const midpoint = (segment.start + segment.end) / 2
        const lineMaterial = accentMaterialOf(boundaryRoom(boundary, midpoint)?.path ?? "")
        if (boundary.axis === "x") {
          box(length, 2.2, 0.2, materials.wall, midpoint, 1.1, boundary.fixed, sceneDecor)
          box(length, 0.04, 0.06, lineMaterial, midpoint, 2.22, boundary.fixed, sceneDecor).castShadow = false
          ;[segment.start, segment.end].forEach((edge) => cylinder(0.1, 2.2, materials.wall, edge, 1.1, boundary.fixed, sceneDecor))
        } else {
          box(0.2, 2.2, length, materials.wall, boundary.fixed, 1.1, midpoint, sceneDecor)
          box(0.06, 0.04, length, lineMaterial, boundary.fixed, 2.22, midpoint, sceneDecor).castShadow = false
          ;[segment.start, segment.end].forEach((edge) => cylinder(0.1, 2.2, materials.wall, boundary.fixed, 1.1, edge, sceneDecor))
        }
      })

      merged.forEach((opening) => {
        ;[opening.start, opening.end].forEach((position) => {
          if (position <= boundary.start || position >= boundary.end) return
          if (boundary.axis === "x") {
            cylinder(0.14, 2.2, materials.wall, position, 1.1, boundary.fixed, sceneDecor)
          } else {
            cylinder(0.14, 2.2, materials.wall, boundary.fixed, 1.1, position, sceneDecor)
          }
        })
      })
    }

    ;[
      { axis: "x" as const, fixed: -3, start: -41, end: 41 },
      { axis: "x" as const, fixed: 3, start: -41, end: 41 },
      { axis: "z" as const, fixed: -3, start: -31, end: 17 },
      { axis: "z" as const, fixed: 3, start: -31, end: 17 },
    ].forEach(addSectionBoundary)

    const buildOpenCommon = (x: number, z: number, width: number, depth: number) => {
      const group = new THREE.Group()
      group.position.set(x, 0, z)
      sceneDecor.add(group)
      const floor = new THREE.Mesh(
        geometries.plane,
        new THREE.MeshLambertMaterial({ color: theme.tile, side: THREE.DoubleSide }),
      )
      floor.scale.set(width, depth, 1)
      floor.rotation.x = -Math.PI / 2
      floor.position.y = 0.016
      floor.receiveShadow = true
      group.add(floor)
      return group
    }

    const commonPartition = (parent: THREE.Object3D, width: number, depth: number, x: number, z: number) => {
      box(width, 1.3, depth, materials.wall, x, 0.65, z, parent)
    }

    activeZone = "overview"
    toneRoomPath = "/"
    const pantry = buildOpenCommon(10, -7, 14, 8)
    commonPartition(pantry, 14, 0.2, 0, 4)
    box(7, 0.1, 0.7, materials.wood, -1.8, 0.92, 3.45, pantry)
    box(7, 0.82, 0.65, materials.metal, -1.8, 0.41, 3.45, pantry)
    box(1.1, 0.7, 0.55, materials.dark, 3.2, 1.25, 3.45, pantry)
    waterCooler(pantry, 5, 3.2)
    box(5.5, 0.12, 0.5, materials.wood, -1.5, 1.8, 3.6, pantry)
    cylinder(1.25, 0.09, materials.desk, 0, 0.75, -0.8, pantry)
    for (let index = 0; index < 4; index += 1) {
      const angle = index / 4 * Math.PI * 2
      cylinder(0.28, 0.1, chairMat(), Math.cos(angle) * 2, 0.48, -0.8 + Math.sin(angle) * 2, pantry)
      chairSupport(pantry, Math.cos(angle) * 2, -0.8 + Math.sin(angle) * 2, 0.22)
    }
    plant(pantry, 5, -3, 1.1)

    const copyRoom = buildOpenCommon(-10, 7, 10, 8)
    printer(copyRoom, -2.6, 2.5, Math.PI)
    printer(copyRoom, -0.6, 2.5, Math.PI)
    bookshelf(copyRoom, -2.4, -3.5, Math.PI)
    bookshelf(copyRoom, 2.4, -3.5, Math.PI)
    box(2.4, 0.82, 0.8, materials.wood, 2.6, 0.41, 1.4, copyRoom)
    box(0.8, 0.12, 0.55, materials.dark, 2.6, 0.9, 1.4, copyRoom)
    plant(copyRoom, 4, 3, 0.9)

    const lounge = buildOpenCommon(-14, 18.5, 18, 11)
    rug(lounge, -3.8, 0, 7, 8, theme.dark ? "#4b5563" : "#d5c7b6")
    circleRug(lounge, 3.8, 0, 4.2, theme.dark ? "#525d6c" : "#c9d5e2")
    sofaSet(lounge, -5, 0, Math.PI / 2)
    sofaSet(lounge, 0, -3.2, 0)
    sofaSet(lounge, 5, 0, -Math.PI / 2)
    coffeeTable(lounge, -2.2, 0)
    coffeeTable(lounge, 2.2, 0)
    floorLamp(lounge, -7, 4.5)
    floorLamp(lounge, 7, 4.5)
    ;[[-7, -4.5], [7, -4.5]].forEach(([x, z]) => plant(lounge, x, z, 1.35))

    const sharedMeeting = buildOpenCommon(30, -7, 14, 8)
    meetingTable(sharedMeeting, 0, 0, 8)
    whiteboard(sharedMeeting, 0, -3.75, 0)
    plant(sharedMeeting, 5.8, 2.8)

    for (let z = -29; z <= 15; z += 12) {
      plant(sceneDecor, -3.7, z, 0.72)
      plant(sceneDecor, 3.7, z, 0.72)
    }
    for (let x = -38; x <= 38; x += 12) {
      if (x < -4 || x > 4) {
        plant(sceneDecor, x, -3.7, 0.72)
        plant(sceneDecor, x, 3.7, 0.72)
      }
    }
    plant(sceneDecor, -1, 1, 1.65)

    let staticMeshCount = 0
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) staticMeshCount += 1
    })
    canvas.dataset.sceneMeshCount = String(staticMeshCount)
    canvas.dataset.sceneNeonStripCount = String(neonStripCount)
    canvas.dataset.topLabelMinSizeCount = String(topLabelMinSizeCount)

    let personVisuals = new Map<string, PersonVisual>()
    let selectedUid: string | null = null
    let activeRoomPath: string | null = null
    let occupiedRoomPaths = new Set<string>()
    let frame = FIT_H
    let userAdjustedView = false
    let suppressControlChange = false
    const roomZoom = (room: Room) => Math.min(controls.maxZoom, frame * 1.6 / Math.max(room.w, room.d))

    let cameraTween: { from: THREE.Vector3; to: THREE.Vector3; fromZoom: number; toZoom: number; fromOffset: THREE.Vector3; toOffset: THREE.Vector3; progress: number } | null = null
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    const updateControls = () => {
      suppressControlChange = true
      controls.update()
      suppressControlChange = false
    }
    const handleControlChange = () => {
      if (!suppressControlChange) userAdjustedView = true
    }
    controls.addEventListener("change", handleControlChange)

    const focusAt = (target: THREE.Vector3, zoom = camera.zoom, offset?: THREE.Vector3) => {
      const next = target.clone().setY(0)
      if (reducedMotion.matches) {
        controls.target.copy(next)
        camera.zoom = zoom
        if (offset) camera.position.copy(next).add(offset)
        camera.updateProjectionMatrix()
        updateControls()
        return
      }
      const currentOffset = camera.position.clone().sub(controls.target)
      cameraTween = {
        from: controls.target.clone(),
        to: next,
        fromZoom: camera.zoom,
        toZoom: zoom,
        fromOffset: currentOffset,
        toOffset: offset ? offset.clone() : currentOffset,
        progress: 0,
      }
    }

    const setRoomLit = (path: string, lit: boolean) => {
      const lighting = roomGroups.get(path)?.lighting
      if (!lighting) return
      lighting.beamMaterial.opacity = lit ? 0.14 : 0
      lighting.poolMaterial.opacity = lit ? 0.42 : 0
      const zoneMaterial = zoneMaterials.find((entry) => entry.room.path === path)
      if (zoneMaterial) {
        zoneMaterial.carpet.color.copy(zoneMaterial.baseColor)
        if (lit) zoneMaterial.carpet.color.lerp(new THREE.Color(0xffffff), 0.35)
      }
    }

    const refreshRoomLighting = () => {
      const litRooms: Room[] = []
      roomGroups.forEach((entry, path) => {
        const lit = path === activeRoomPath || occupiedRoomPaths.has(path)
        setRoomLit(path, lit)
        entry.group.visible = true
        if (lit) litRooms.push(entry.room)
      })
      sceneDecor.visible = true

      // 고른 방을 맨 앞에 둔다. 광원이 모자라도 고른 방은 반드시 켜진다.
      litRooms.sort((left, right) => Number(right.path === activeRoomPath) - Number(left.path === activeRoomPath))
      roomLights.forEach((light, index) => {
        const room = litRooms[index]
        if (!room) {
          light.intensity = 0
          return
        }
        light.position.set(room.x, 3.4, room.z)
        light.intensity = room.path === activeRoomPath ? 4.2 : 3
      })
    }

    const selectRoom = (path: string | null) => {
      activeRoomPath = path && roomGroups.has(path) ? path : null
      roomGroups.forEach((entry, roomPath) => {
        const selected = roomPath === activeRoomPath
        entry.group.visible = true
        if (entry.flag) entry.flag.visible = !selected
        entry.objects.forEach((node) => {
          node.visible = selected
        })
        entry.facilities.forEach((label) => {
          label.visible = selected
          const facilityHit = entry.group.children.find((child) => child.userData.kind === "facility" && child.userData.id === label.userData.id && child !== label)
          if (facilityHit) facilityHit.visible = selected
        })
      })
      refreshRoomLighting()
      if (activeRoomPath) {
        const room = roomGroups.get(activeRoomPath)?.room
        if (room) focusAt(new THREE.Vector3(room.x, 0, room.z), roomZoom(room))
      } else {
        focusAt(new THREE.Vector3(0, 0, -2), frame * 0.94 / 58)
      }
    }

    const applyFocus = (uid: string | null, moveCamera: boolean) => {
      selectedUid = uid
      personVisuals.forEach((visual) => {
        const selected = uid === visual.data.uid
        const muted = uid !== null && !selected
        visual.avatarParts.forEach((part) => {
          part.material.transparent = muted
          part.material.opacity = muted ? 0.28 : 1
        })
        visual.selfRing.material.opacity = muted ? 0.16 : 0.72
        visual.focusRing.visible = selected
        visual.tag.material.opacity = muted ? 0.38 : 1
      })
      const selected = uid ? personVisuals.get(uid) : null
      if (moveCamera && selected) {
        const room = roomGroups.get(selected.data.path)?.room
        if (room) {
          // 그 방 중심에서 아바타 쪽을 보는 방위각으로 틀고, 극각은 52도로 낮춰 아바타가 보이게 한다.
          const dx = selected.group.position.x - room.x
          const dz = selected.group.position.z - room.z
          const azimuth = Math.hypot(dx, dz) < 0.2 ? Math.atan2(1, 1) : Math.atan2(dx, dz)
          const polar = 0.9
          const distance = 70
          const offset = new THREE.Vector3(
            Math.sin(polar) * Math.sin(azimuth) * distance,
            Math.cos(polar) * distance,
            Math.sin(polar) * Math.cos(azimuth) * distance,
          )
          focusAt(selected.group.position, roomZoom(room), offset)
        } else {
          focusAt(selected.group.position)
        }
      }
    }

    const posePerson = (visual: PersonVisual, seated: boolean) => {
      visual.seated = seated
      const offset = seated ? -0.23 : 0
      visual.poseParts.forEach((part) => {
        part.position.y = (part.userData.standingY as number) + offset
      })
      visual.base.visible = !seated
      visual.leftLeg.rotation.x = seated ? -Math.PI / 2.7 : 0
      visual.rightLeg.rotation.x = seated ? -Math.PI / 2.7 : 0
      const poleStart = seated ? 1.39 : 1.62
      visual.flagPole.position.y = poleStart + 0.31
      visual.flag.position.y = poleStart + 0.49
      visual.tag.position.y = 3.9 + offset
    }

    const updatePersonTag = (visual: PersonVisual, person: PresencePerson) => {
      const screen = person.screen || person.path
      const shortScreen = screen.length > 10 ? `${screen.slice(0, 10)}…` : screen
      const text = `${person.name}${person.isSelf ? " (나)" : ""} · ${shortScreen}`
      const entry = labelEntries.find((candidate) => candidate.sprite === visual.tag)
      const nextBadge = person.status ? STATUS_COLORS[person.status] : undefined
      if (!entry || (entry.text === text && entry.options.badgeColor === nextBadge && entry.options.mood === person.mood)) return
      entry.text = text
      entry.options = { ...entry.options, badgeColor: nextBadge, mood: person.mood }
      const drawing = drawLabel(text, entry.options)
      visual.tag.material.map?.dispose()
      visual.tag.material.map = textureOf(drawing.canvas)
      const scale = (entry.options.scale ?? 1) * 0.0085
      visual.tag.userData.baseW = drawing.width * scale
      visual.tag.userData.baseH = drawing.height * scale
      visual.tag.material.needsUpdate = true
    }

    const createPerson = (person: PresencePerson, target: THREE.Vector3, seated: boolean, phase: number): PersonVisual => {
      const group = new THREE.Group()
      group.position.copy(target)
      const uidHash = Array.from(person.uid).reduce((sum, character) => sum + character.charCodeAt(0), 0)
      const hairStyle = uidHash % 4
      const shirtColors = ["#4a6fb5", "#3d8f86", "#b5664a", "#9a5aa8", "#c4566b", "#5c6878"]
      const pantsColors = ["#3a4452", "#4a5668", "#2f3844"]
      const shirtColor = shirtColors[Math.floor(uidHash / 4) % shirtColors.length]
      const pantsColor = pantsColors[Math.floor(uidHash / 24) % pantsColors.length]
      const wearsGlasses = Math.floor(uidHash / 72) % 2 === 1
      const avatarMaterial = (color: THREE.ColorRepresentation) => {
        const baseColor = new THREE.Color(color)
        return new THREE.MeshLambertMaterial({
          color: baseColor,
          emissive: baseColor.clone().lerp(new THREE.Color(0x000000), 0.45),
          emissiveIntensity: 1,
        })
      }
      const shirtMaterial = avatarMaterial(shirtColor)
      const pantsMaterial = avatarMaterial(pantsColor)
      const skinMaterial = avatarMaterial(0xe8c49a)
      const accentMaterial = avatarMaterial(person.color)
      const avatarParts: Array<THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>> = []
      const poseParts: Array<THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>> = []
      // 몸만 키운다. 이름표와 고리는 바깥 그룹에 남겨 같이 커지지 않게 한다.
      const rig = new THREE.Group()
      rig.scale.setScalar(1.55)
      group.add(rig)
      const avatarBox = (
        width: number,
        height: number,
        depth: number,
        material: THREE.MeshLambertMaterial,
        x: number,
        y: number,
        z = 0,
      ) => {
        const part = new THREE.Mesh(geometries.box, material)
        part.scale.set(width, height, depth)
        part.position.set(x, y, z)
        part.userData.standingY = y
        part.castShadow = true
        rig.add(part)
        avatarParts.push(part)
        poseParts.push(part)
        return part
      }
      const avatarCylinder = (
        radius: number,
        height: number,
        material: THREE.MeshLambertMaterial,
        x: number,
        y: number,
        z = 0,
      ) => {
        const part = new THREE.Mesh(geometries.cylinder, material)
        part.scale.set(radius, height, radius)
        part.position.set(x, y, z)
        part.userData.standingY = y
        part.castShadow = true
        group.add(part)
        avatarParts.push(part)
        poseParts.push(part)
        return part
      }

      const base = avatarCylinder(0.34, 0.05, accentMaterial, 0, 0.025)
      poseParts.pop()
      const leftLeg = avatarBox(0.17, 0.52, 0.2, pantsMaterial, -0.11, 0.31)
      const rightLeg = avatarBox(0.17, 0.52, 0.2, pantsMaterial, 0.11, 0.31)
      avatarBox(0.44, 0.1, 0.26, pantsMaterial, 0, 0.62)
      const body = avatarBox(0.5, 0.56, 0.3, shirtMaterial, 0, 0.95)
      avatarBox(0.12, 0.46, 0.16, shirtMaterial, -0.31, 0.96)
      avatarBox(0.12, 0.46, 0.16, shirtMaterial, 0.31, 0.96)
      avatarCylinder(0.075, 0.1, skinMaterial, -0.31, 0.71)
      avatarCylinder(0.075, 0.1, skinMaterial, 0.31, 0.71)
      avatarCylinder(0.09, 0.08, skinMaterial, 0, 1.27)
      const head = avatarBox(0.42, 0.42, 0.4, skinMaterial, 0, 1.52)
      avatarBox(0.06, 0.08, 0.02, pantsMaterial, -0.1, 1.56, 0.205)
      avatarBox(0.06, 0.08, 0.02, pantsMaterial, 0.1, 1.56, 0.205)

      if (hairStyle === 1 || hairStyle === 2) {
        avatarBox(0.44, 0.12, 0.42, pantsMaterial, 0, 1.73)
        if (hairStyle === 2) avatarBox(0.46, 0.2, 0.1, pantsMaterial, 0, 1.55, -0.2)
      } else if (hairStyle === 3) {
        avatarBox(0.5, 0.05, 0.34, shirtMaterial, 0, 1.73, 0.12)
      }
      if (wearsGlasses) avatarBox(0.3, 0.03, 0.02, pantsMaterial, 0, 1.56, 0.21)

      const glowRing = new THREE.Mesh(
        new THREE.RingGeometry(0.34, 0.62, 28),
        new THREE.MeshBasicMaterial({
          color: person.color,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      )
      glowRing.rotation.x = -Math.PI / 2
      glowRing.position.y = 0.02
      glowRing.renderOrder = 4
      group.add(glowRing)

      const selfRing = new THREE.Mesh(
        new THREE.RingGeometry(0.49, 0.57, 32),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(person.color), transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false }),
      )
      selfRing.rotation.x = -Math.PI / 2
      selfRing.position.y = 0.023
      selfRing.visible = person.isSelf
      group.add(selfRing)

      const focusRing = new THREE.Mesh(
        new THREE.RingGeometry(0.27, 0.5, 32),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(person.color), side: THREE.DoubleSide, depthWrite: false }),
      )
      focusRing.rotation.x = -Math.PI / 2
      focusRing.position.y = 0.025
      focusRing.visible = false
      group.add(focusRing)

      const flagPole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.62, 10),
        new THREE.MeshLambertMaterial({ color: theme.metal }),
      )
      flagPole.castShadow = true
      group.add(flagPole)
      const flagGeometry = new THREE.PlaneGeometry(0.44, 0.26, 10, 1)
      const flagBasePositions = new Float32Array(flagGeometry.attributes.position.array)
      const flag = new THREE.Mesh(
        flagGeometry,
        new THREE.MeshLambertMaterial({ color: new THREE.Color(person.color), side: THREE.DoubleSide }),
      )
      flag.position.x = 0.238
      flag.castShadow = true
      group.add(flag)
      if (person.isSelf) {
        const border = new THREE.Mesh(
          new THREE.PlaneGeometry(0.48, 0.3),
          new THREE.MeshBasicMaterial({ color: theme.dark ? 0xffffff : 0xfff7d6, side: THREE.DoubleSide }),
        )
        border.position.set(0, 0, -0.012)
        flag.add(border)
      }

      const screen = person.screen || person.path
      const shortScreen = screen.length > 10 ? `${screen.slice(0, 10)}…` : screen
      const tag = makeLabel(`${person.name}${person.isSelf ? " (나)" : ""} · ${shortScreen}`, {
        color: person.color,
        size: 52,
        weight: 800,
        scale: 2.4,
      })
      tag.userData = { ...tag.userData, kind: "person", id: person.uid }
      group.add(tag)

      const hit = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ visible: false }))
      hit.scale.set(1.4, 3.6, 1.4)
      hit.position.y = 1.8
      hit.userData = { kind: "person", id: person.uid }
      group.add(hit)

      const visual: PersonVisual = {
        data: person,
        group,
        body,
        head,
        base,
        glowRing,
        selfRing,
        focusRing,
        tag,
        leftLeg,
        rightLeg,
        flagPole,
        flag,
        flagBasePositions,
        hit,
        avatarParts,
        poseParts,
        target: target.clone(),
        seated,
        targetSeated: seated,
        phase,
      }
      posePerson(visual, seated)
      scene.add(group)
      pickables.push(hit, tag)
      return visual
    }

    const syncPeople = (nextPeople: PresencePerson[]) => {
      const byRoom = new Map<string, PresencePerson[]>()
      nextPeople.forEach((person) => {
        if (!roomGroups.has(person.path)) return
        const group = byRoom.get(person.path) ?? []
        group.push(person)
        byRoom.set(person.path, group)
      })
      occupiedRoomPaths = new Set(byRoom.keys())

      const nextIds = new Set(nextPeople.map((person) => person.uid))
      personVisuals.forEach((visual, uid) => {
        if (nextIds.has(uid)) return
        labelEntries = labelEntries.filter((entry) => entry.sprite !== visual.tag)
        const visualPickables = new Set<THREE.Object3D>([visual.hit, visual.tag])
        pickables.splice(0, pickables.length, ...pickables.filter((candidate) => !visualPickables.has(candidate)))
        scene.remove(visual.group)
        disposeObject(visual.group)
        personVisuals.delete(uid)
      })

      let visualIndex = 0
      byRoom.forEach((roomPeople, path) => {
        const room = roomGroups.get(path)?.room
        if (!room) return
        const span = Math.min(room.w - 2.4, 4.2)
        roomPeople.forEach((person, index) => {
          const spread = Math.min(room.w - 3, (roomPeople.length - 1) * 1.6)
          const x = roomPeople.length === 1 ? 0 : -spread / 2 + (spread / (roomPeople.length - 1)) * index
          const spot = person.spot && person.spot.path === person.path ? person.spot : null
          const target = spot
            ? new THREE.Vector3(room.x + spot.x, 0, room.z + spot.z)
            : new THREE.Vector3(room.x + x, 0, room.z)
          const seated = !spot && room.path !== "/warehouse" && room.path !== "/process-innovation" && room.path !== "/trend/fabric"
          const existing = personVisuals.get(person.uid)
          if (existing) {
            existing.data = person
            existing.target.copy(target)
            existing.targetSeated = seated
            if (existing.group.position.distanceToSquared(target) > 0.0025) posePerson(existing, false)
            existing.base.material.color.set(person.color)
            existing.base.material.emissive.copy(existing.base.material.color).lerp(new THREE.Color(0x000000), 0.45)
            existing.glowRing.material.color.set(person.color)
            existing.flag.material.color.set(person.color)
            existing.selfRing.visible = person.isSelf
            updatePersonTag(existing, person)
          } else {
            personVisuals.set(person.uid, createPerson(person, target, seated, visualIndex * 0.7))
          }
          visualIndex += 1
        })
      })
      applyFocus(selectedUid, false)
      refreshRoomLighting()
    }

    const BUBBLE_MS = 8_000
    const bubbleSprites = new Map<string, { sprite: THREE.Sprite; text: string }>()

    const drawBubble = (text: string, color: string) => {
      const lines: string[] = []
      let rest = text
      while (rest.length > 0 && lines.length < 2) {
        lines.push(rest.slice(0, 18))
        rest = rest.slice(18)
      }
      if (rest.length > 0) lines[1] = `${lines[1].slice(0, 17)}…`
      const dpr = Math.min(window.devicePixelRatio, 2)
      const canvas = document.createElement("canvas")
      const context = canvas.getContext("2d")
      if (!context) return { canvas, width: 1, height: 1 }
      const font = `600 34px "Noto Sans KR", system-ui, sans-serif`
      context.font = font
      const textWidth = Math.max(...lines.map((line) => context.measureText(line).width))
      const width = Math.ceil(textWidth + 40)
      const height = Math.ceil(lines.length * 42 + 36)
      canvas.width = width * dpr
      canvas.height = height * dpr
      context.scale(dpr, dpr)
      context.fillStyle = "#ffffff"
      context.strokeStyle = color
      context.lineWidth = 3
      context.beginPath()
      context.roundRect(2, 2, width - 4, height - 18, 14)
      context.fill()
      context.stroke()
      context.beginPath()
      context.moveTo(width / 2 - 9, height - 16)
      context.lineTo(width / 2, height - 3)
      context.lineTo(width / 2 + 9, height - 16)
      context.closePath()
      context.fillStyle = "#ffffff"
      context.fill()
      context.strokeStyle = color
      context.stroke()
      context.fillStyle = "#2a3340"
      context.font = font
      context.textAlign = "center"
      context.textBaseline = "middle"
      lines.forEach((line, index) => context.fillText(line, width / 2, 28 + index * 42))
      return { canvas, width, height }
    }

    const setBubbles = (map: Record<string, { text: string; at: number }>) => {
      personVisuals.forEach((visual, uid) => {
        const entry = map[uid]
        let bubble = bubbleSprites.get(uid)
        if (!entry || Date.now() - entry.at > BUBBLE_MS) {
          if (bubble) bubble.sprite.visible = false
          return
        }
        if (!bubble) {
          const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }))
          sprite.position.set(0, 4.9, 0)
          sprite.renderOrder = 6
          visual.group.add(sprite)
          bubble = { sprite, text: "" }
          bubbleSprites.set(uid, bubble)
        }
        bubble.sprite.visible = true
        bubble.sprite.userData.until = entry.at + BUBBLE_MS
        if (bubble.text !== entry.text) {
          bubble.text = entry.text
          const drawing = drawBubble(entry.text, visual.data.color)
          bubble.sprite.material.map?.dispose()
          bubble.sprite.material.map = textureOf(drawing.canvas)
          bubble.sprite.userData.baseW = drawing.width * 0.0075
          bubble.sprite.userData.baseH = drawing.height * 0.0075
        }
      })
    }

    apiRef.current = {
      syncPeople,
      setBubbles,
      focusPerson: applyFocus,
      selectRoom,
    }

    const raycaster = new THREE.Raycaster()
    raycaster.params.Sprite = { threshold: 0 }
    const pointer = new THREE.Vector2()
    let pointerDown: { x: number; y: number } | null = null
    let lastPointerMove = 0

    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const isWorldVisible = (object: THREE.Object3D) => {
      let current: THREE.Object3D | null = object
      while (current) {
        if (!current.visible) return false
        current = current.parent
      }
      return true
    }

    const pickAt = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect()
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      return raycaster.intersectObjects(pickables, false).find((intersection) => isWorldVisible(intersection.object))
    }

    const handlePointerDown = (event: PointerEvent) => {
      pointerDown = { x: event.clientX, y: event.clientY }
    }
    const handlePointerMove = (event: PointerEvent) => {
      const now = performance.now()
      if (now - lastPointerMove < 150) return
      lastPointerMove = now
      const hit = pickAt(event)
      const data = hit?.object.userData as { kind?: "room" | "floor" | "person" | "facility" | "object"; path?: string | null } | undefined
      canvas.style.cursor = data?.kind === "facility" && data.path
        ? "pointer"
        : data?.kind === "room" || data?.kind === "person" || data?.kind === "object"
          ? "pointer"
          : "default"
    }
    const handlePointerUp = (event: PointerEvent) => {
      if (!pointerDown) return
      const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y)
      pointerDown = null
      if (moved > 6) return
      const hit = pickAt(event)
      if (!hit) {
        if (activeRoomPath) {
          selectRoom(null)
          onPickRef.current("room", "")
        }
        return
      }
      const data = hit.object.userData as { kind?: "room" | "floor" | "person" | "facility" | "object"; id?: string; path?: string | null }
      if (!data.kind || !data.id) return
      if (data.kind === "floor") {
        if (data.id !== activeRoomPath) return
        const room = roomGroups.get(activeRoomPath)?.room
        const point = new THREE.Vector3()
        if (room && raycaster.ray.intersectPlane(groundPlane, point)) {
          const localX = THREE.MathUtils.clamp(point.x - room.x, -room.w / 2 + 1, room.w / 2 - 1)
          const localZ = THREE.MathUtils.clamp(point.z - room.z, -room.d / 2 + 1, room.d / 2 - 1)
          onPickRef.current("spot", `${localX.toFixed(2)},${localZ.toFixed(2)}`, activeRoomPath)
        }
        return
      }
      if (data.kind === "room") {
        selectRoom(data.id)
        onPickRef.current("room", data.id)
        return
      } else if (data.kind === "person") {
        applyFocus(data.id, true)
      } else if (data.kind === "object") {
        onPickRef.current("object", data.id)
      }
      if (data.kind !== "facility" || data.path) onPickRef.current(data.kind, data.id, data.path ?? undefined)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return
      if (event.code === "Space") {
        event.preventDefault()
        controls.mouseButtons.LEFT = THREE.MOUSE.PAN
        return
      }
      if (event.key !== "Escape" || !activeRoomPath) return
      selectRoom(null)
      onPickRef.current("room", "")
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return
      event.preventDefault()
      controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE
    }
    const handleWindowBlur = () => {
      controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE
    }
    const handleDoubleClick = () => {
      // 방을 고른 경우와 사람을 고른 경우 둘 다 빠져나온다.
      if (!activeRoomPath && !selectedUid) return
      if (activeRoomPath) {
        selectRoom(null)
        onPickRef.current("room", "")
      }
      if (selectedUid) {
        applyFocus(null, false)
        onPickRef.current("person", "")
      }
      // 전체 보기로 돌아갈 때 처음 자리와 줄으로 되돌린다.
      userAdjustedView = false
      const distance = 70
      const polar = Math.PI / 4
      focusAt(
        new THREE.Vector3(0, 0, -2),
        frame * 0.94 / 58,
        new THREE.Vector3(0, Math.cos(polar) * distance, Math.sin(polar) * distance),
      )
    }
    canvas.addEventListener("dblclick", handleDoubleClick)
    canvas.addEventListener("pointerdown", handlePointerDown)
    canvas.addEventListener("pointermove", handlePointerMove)
    canvas.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    window.addEventListener("blur", handleWindowBlur)

    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      const width = Math.max(1, bounds.width)
      const height = Math.max(1, bounds.height)
      renderer.setSize(width, height, false)
      const aspect = width / height
      frame = Math.max(FIT_H, FIT_W / aspect)
      camera.left = -frame * aspect / 2
      camera.right = frame * aspect / 2
      camera.top = frame / 2
      camera.bottom = -frame / 2
      if (!userAdjustedView) {
        camera.zoom = frame * 0.94 / 58
        updateControls()
      }
      camera.updateProjectionMatrix()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
    resize()

    const repaint = () => {
      theme = readTheme()
      scene.background = theme.bg
      if (theme.dark) {
        if (scene.fog instanceof THREE.Fog) {
          scene.fog.near = 150
          scene.fog.far = 320
        } else {
          scene.fog = new THREE.Fog(theme.bg, 150, 320)
        }
      } else {
        scene.fog = null
      }
      if (scene.fog instanceof THREE.Fog) scene.fog.color.copy(theme.bg)
      materials.floor.color.copy(theme.floor)
      materials.wall.color.copy(theme.wall)
      materials.glass.color.copy(theme.glass)
      materials.glass.opacity = theme.dark ? 0.16 : 0.22
      materials.desk.color.copy(theme.desk)
      materials.metal.color.copy(theme.metal)
      materials.wood.color.copy(theme.wood)
      materials.dark.color.copy(theme.darkFloor)
      corridorMaterial.color.copy(theme.floor).lerp(new THREE.Color(0xffffff), 0.18)
      hemi.color.set(theme.dark ? 0x5b7ba8 : 0xffffff)
      hemi.groundColor.set(theme.dark ? 0x1a222e : 0xaeb8c6)
      hemi.intensity = theme.dark ? 0.85 : 0.58
      sun.intensity = theme.dark ? 0.8 : 0.62
      ambient.intensity = theme.dark ? 0.25 : 0.32
      fill.intensity = theme.dark ? 0.3 : 0.35
      ;(Object.keys(neonMaterials) as ZoneKey[]).forEach((zone) => {
        neonMaterials[zone].color.set(theme.neon[zone])
      })
      zoneMaterials.forEach((entry) => {
        entry.baseColor.copy(roomFloorColor(entry.room))
        entry.carpet.color.copy(entry.baseColor)
        if (entry.room.path === activeRoomPath || occupiedRoomPaths.has(entry.room.path)) {
          entry.carpet.color.lerp(new THREE.Color(0xffffff), 0.35)
        }
      })
      bubbleSprites.forEach((bubble) => {
        if (!bubble.sprite.visible) return
        if (Date.now() > (bubble.sprite.userData.until as number)) {
          bubble.sprite.visible = false
          return
        }
        const baseW = bubble.sprite.userData.baseW as number
        const baseH = bubble.sprite.userData.baseH as number
        if (baseW) bubble.sprite.scale.set(baseW / camera.zoom, baseH / camera.zoom, 1)
      })

      labelEntries.forEach((entry) => {
        const drawing = entry.facility
          ? drawFacilityLabel(entry.text, entry.options, entry.clickable ?? false)
          : drawLabel(entry.text, entry.options)
        const material = entry.sprite.material
        material.map?.dispose()
        material.map = textureOf(drawing.canvas)
        const scale = (entry.options.scale ?? 1) * 0.0085
        entry.sprite.userData.baseW = drawing.width * scale
        entry.sprite.userData.baseH = drawing.height * scale
        material.needsUpdate = true
      })
      personVisuals.forEach((visual) => visual.flagPole.material.color.copy(theme.metal))
    }
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)")
    colorScheme.addEventListener("change", repaint)
    const themeObserver = new MutationObserver(repaint)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] })

    const clock = new THREE.Clock()
    let elapsed = 0
    let animationFrame = 0
    const tick = () => {
      animationFrame = window.requestAnimationFrame(tick)
      const delta = Math.min(clock.getDelta(), 0.05)
      elapsed += delta
      if (cameraTween) {
        cameraTween.progress = Math.min(1, cameraTween.progress + delta * 2.6)
        const eased = 1 - (1 - cameraTween.progress) ** 3
        controls.target.lerpVectors(cameraTween.from, cameraTween.to, eased)
        camera.zoom = THREE.MathUtils.lerp(cameraTween.fromZoom, cameraTween.toZoom, eased)
        const blended = cameraTween.fromOffset.clone().lerp(cameraTween.toOffset, eased)
        camera.position.copy(controls.target).add(blended)
        camera.updateProjectionMatrix()
        if (cameraTween.progress >= 1) cameraTween = null
      }
      personVisuals.forEach((visual) => {
        const toTarget = visual.target.clone().sub(visual.group.position)
        const distance = toTarget.length()
        const walking = distance > 0.045
        if (walking && !reducedMotion.matches) {
          const step = Math.min(distance, delta * 5.2)
          visual.group.position.addScaledVector(toTarget.normalize(), step)
          const targetAngle = Math.atan2(toTarget.x, toTarget.z)
          const angleDelta = Math.atan2(Math.sin(targetAngle - visual.group.rotation.y), Math.cos(targetAngle - visual.group.rotation.y))
          visual.group.rotation.y += angleDelta * (1 - Math.exp(-delta * 8))
          const stride = Math.sin(elapsed * 2.5 * Math.PI * 2) * 0.4
          visual.leftLeg.rotation.x = stride
          visual.rightLeg.rotation.x = -stride
          visual.body.position.y = 0.95 + Math.abs(Math.sin(elapsed * 2.5 * Math.PI * 2)) * 0.03
        } else if (walking) {
          visual.group.position.copy(visual.target)
          posePerson(visual, visual.targetSeated)
        } else {
          if (visual.seated !== visual.targetSeated) posePerson(visual, visual.targetSeated)
          if (!visual.seated) {
            visual.leftLeg.rotation.x = THREE.MathUtils.lerp(visual.leftLeg.rotation.x, 0, 0.24)
            visual.rightLeg.rotation.x = THREE.MathUtils.lerp(visual.rightLeg.rotation.x, 0, 0.24)
            visual.body.position.y = THREE.MathUtils.lerp(visual.body.position.y, 0.95, 0.24)
          }
        }

        const positions = visual.flag.geometry.attributes.position as THREE.BufferAttribute
        const active = visual.data.ago < 90
        const recent = visual.data.ago >= 90 && visual.data.ago < 150
        const speed = walking ? 9 : active ? 6 : recent ? 3 : 1.2
        const amplitude = walking ? 1.3 : active ? 1 : recent ? 0.55 : 0.25
        for (let index = 0; index < positions.count; index += 1) {
          const x = visual.flagBasePositions[index * 3]
          const t = THREE.MathUtils.clamp((x + 0.22) / 0.44, 0, 1)
          const z = reducedMotion.matches ? 0 : Math.sin(elapsed * speed + t * 6) * 0.07 * t * amplitude
          positions.setZ(index, z)
        }
        positions.needsUpdate = true
      })
      labelEntries.forEach((entry) => {
        const baseW = entry.sprite.userData.baseW as number
        const baseH = entry.sprite.userData.baseH as number
        entry.sprite.scale.set(baseW / camera.zoom, baseH / camera.zoom, 1)
      })
      updateControls()
      renderer.render(scene, camera)
    }
    tick()

    return () => {
      apiRef.current = null
      window.cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      themeObserver.disconnect()
      colorScheme.removeEventListener("change", repaint)
      canvas.removeEventListener("pointerdown", handlePointerDown)
      canvas.removeEventListener("pointermove", handlePointerMove)
      canvas.removeEventListener("dblclick", handleDoubleClick)
      canvas.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      window.removeEventListener("blur", handleWindowBlur)
      controls.removeEventListener("change", handleControlChange)
      controls.dispose()
      disposeObject(scene)
      renderer.dispose()
    }
  }, [])

  useEffect(() => {
    apiRef.current?.syncPeople(people)
  }, [peopleKey])

  useEffect(() => {
    apiRef.current?.setBubbles(bubbles ?? {})
  }, [bubbles, peopleKey])

  useEffect(() => {
    apiRef.current?.focusPerson(focusUid, true)
  }, [focusUid])

  useEffect(() => {
    apiRef.current?.selectRoom(selectedRoomPath)
  }, [selectedRoomPath])

  return (
    <canvas
      ref={canvasRef}
      className="block h-full w-full touch-none"
      aria-label="접속한 사람들의 현재 화면을 보여 주는 가상 오피스"
    />
  )
}
