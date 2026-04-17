'use client'

import { useRef, useMemo, Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { WeatherTheme } from '@/lib/hooks/use-weather'

// ── Floating particles (rain / snow / dust) ────────────────────────────────────

function Particles({ count, theme }: { count: number; theme: WeatherTheme }) {
  const mesh = useRef<THREE.Points>(null!)

  const [positions, velocities] = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const vel = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 20   // x
      pos[i * 3 + 1] = Math.random() * 12 - 2        // y  (start spread)
      pos[i * 3 + 2] = (Math.random() - 0.5) * 8    // z
      vel[i] = 0.02 + Math.random() * (theme === 'rain' || theme === 'thunder' ? 0.06 : 0.015)
    }
    return [pos, vel]
  }, [count, theme])

  useFrame(() => {
    const pos = mesh.current.geometry.attributes.position.array as Float32Array
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 1] -= velocities[i]
      if (pos[i * 3 + 1] < -6) {
        pos[i * 3 + 1] = 6
        pos[i * 3]     = (Math.random() - 0.5) * 20
        pos[i * 3 + 2] = (Math.random() - 0.5) * 8
      }
    }
    mesh.current.geometry.attributes.position.needsUpdate = true
  })

  const color = theme === 'snow' ? '#dbeafe'
    : theme === 'thunder' ? '#c4b5fd'
    : '#93c5fd'

  const size = theme === 'snow' ? 0.06 : 0.025

  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        color={color}
        size={size}
        transparent
        opacity={theme === 'snow' ? 0.75 : 0.55}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  )
}

// ── Slowly rotating clouds (cloudy / partly-cloudy) ────────────────────────────

function CloudMesh({ x, y, z, scale }: { x: number; y: number; z: number; scale: number }) {
  const mesh = useRef<THREE.Mesh>(null!)
  useFrame(({ clock }) => {
    mesh.current.position.x = x + Math.sin(clock.elapsedTime * 0.05 + x) * 0.3
  })
  return (
    <mesh ref={mesh} position={[x, y, z]} scale={[scale * 2.5, scale, scale]}>
      <sphereGeometry args={[1, 8, 6]} />
      <meshStandardMaterial
        color="#8ba9cc"
        transparent
        opacity={0.08}
        roughness={1}
        metalness={0}
      />
    </mesh>
  )
}

function Clouds() {
  const data = useMemo(() => [
    { x: -4,  y: 3,  z: -2, scale: 1.4 },
    { x:  2,  y: 4,  z: -3, scale: 1.8 },
    { x: -1,  y: 2.5,z: -1, scale: 1.1 },
    { x:  5,  y: 3.5,z: -2, scale: 1.5 },
    { x: -6,  y: 4,  z: -3, scale: 1.2 },
  ], [])
  return (
    <>
      {data.map((d, i) => <CloudMesh key={i} {...d} />)}
    </>
  )
}

// ── Sun orb (clear) ────────────────────────────────────────────────────────────

function SunOrb() {
  const mesh = useRef<THREE.Mesh>(null!)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    mesh.current.scale.setScalar(1 + Math.sin(t * 0.8) * 0.04)
  })
  return (
    <mesh ref={mesh} position={[0, 4.5, -3]}>
      <sphereGeometry args={[1.2, 32, 32]} />
      <meshStandardMaterial
        color="#fbbf24"
        emissive="#f59e0b"
        emissiveIntensity={1.2}
        transparent
        opacity={0.25}
        roughness={1}
      />
    </mesh>
  )
}

// ── Fog planes ────────────────────────────────────────────────────────────────

function FogPlanes() {
  const planes = useRef<THREE.Group>(null!)
  useFrame(({ clock }) => {
    planes.current.children.forEach((child, i) => {
      child.position.x = Math.sin(clock.elapsedTime * 0.03 + i) * 1.5
    })
  })
  return (
    <group ref={planes}>
      {[0, 1, 2, 3].map(i => (
        <mesh key={i} position={[0, 1 + i * 0.8, -1 - i * 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[25, 4]} />
          <meshStandardMaterial
            color="#94a3b8"
            transparent
            opacity={0.04 + i * 0.01}
            roughness={1}
          />
        </mesh>
      ))}
    </group>
  )
}

// ── Lightning bolt (thunder) ───────────────────────────────────────────────────

function LightningBolt() {
  const light = useRef<THREE.PointLight>(null!)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const flash = Math.max(0, Math.sin(t * 3) > 0.97 ? 1.5 : 0)
    light.current.intensity = flash
  })
  return (
    <pointLight ref={light} color="#c4b5fd" position={[0, 5, 0]} intensity={0} distance={12} />
  )
}

// ── Scene selector ─────────────────────────────────────────────────────────────

function Scene({ theme }: { theme: WeatherTheme }) {
  return (
    <>
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 8, 3]} intensity={0.3} color="#e0e7ff" />

      {(theme === 'rain' || theme === 'thunder') && (
        <Particles count={350} theme={theme} />
      )}
      {theme === 'snow' && <Particles count={220} theme={theme} />}
      {(theme === 'cloudy' || theme === 'partly-cloudy') && <Clouds />}
      {theme === 'clear' && <SunOrb />}
      {theme === 'fog' && <FogPlanes />}
      {theme === 'thunder' && <LightningBolt />}
    </>
  )
}

// ── Export ─────────────────────────────────────────────────────────────────────

export function Weather3D({ theme }: { theme: WeatherTheme }) {
  if (theme === 'unknown') return null

  return (
    <div className="pointer-events-none absolute inset-0">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 60 }}
        gl={{ alpha: true, antialias: false, powerPreference: 'low-power' }}
        style={{ background: 'transparent' }}
      >
        <Suspense fallback={null}>
          <Scene theme={theme} />
        </Suspense>
      </Canvas>
    </div>
  )
}
