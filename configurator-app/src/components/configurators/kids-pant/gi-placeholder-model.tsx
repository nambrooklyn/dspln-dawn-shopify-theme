import { memo } from 'react';

import { useGiState } from './gi-state';

/**
 * Placeholder gi geometry for v1.
 * Jacket = chunky box (torso), pants = two narrower boxes, belt = thin band.
 * Each part reads its color from gi state so the merchant can recolor live.
 *
 * This entire component is replaced by `<GiGlbModel />` (loading the real
 * .glb) once Nam delivers the model.
 */
export const GiPlaceholderModel = memo(() => {
  const { partColors, selectedPart, setSelectedPart } = useGiState();

  return (
    <group>
      {/* Jacket — torso block with a slightly extended chest depth so the
          chest decal sits clearly on the front. */}
      <mesh
        position={[0, 1.4, 0]}
        castShadow
        receiveShadow
        onPointerDown={(e) => {
          e.stopPropagation();
          setSelectedPart('jacket');
        }}
      >
        <boxGeometry args={[1.6, 1.4, 0.8]} />
        <meshStandardMaterial
          color={partColors.jacket}
          roughness={0.8}
          metalness={0}
          emissive={selectedPart === 'jacket' ? '#be5c23' : '#000000'}
          emissiveIntensity={selectedPart === 'jacket' ? 0.06 : 0}
        />
      </mesh>

      {/* Sleeves — left + right cylinders for the jacket arms */}
      {[
        { x: -1.0, label: 'left' },
        { x: 1.0, label: 'right' },
      ].map(({ x, label }) => (
        <mesh
          key={label}
          position={[x, 1.4, 0]}
          rotation={[0, 0, Math.PI / 2]}
          castShadow
          receiveShadow
          onPointerDown={(e) => {
            e.stopPropagation();
            setSelectedPart('jacket');
          }}
        >
          <cylinderGeometry args={[0.25, 0.25, 0.8, 24]} />
          <meshStandardMaterial color={partColors.jacket} roughness={0.8} />
        </mesh>
      ))}

      {/* Belt — thin colored band wrapping the waist */}
      <mesh
        position={[0, 0.65, 0]}
        castShadow
        receiveShadow
        onPointerDown={(e) => {
          e.stopPropagation();
          setSelectedPart('belt');
        }}
      >
        <boxGeometry args={[1.65, 0.12, 0.82]} />
        <meshStandardMaterial
          color={partColors.belt}
          roughness={0.6}
          emissive={selectedPart === 'belt' ? '#be5c23' : '#000000'}
          emissiveIntensity={selectedPart === 'belt' ? 0.06 : 0}
        />
      </mesh>

      {/* Pants — two leg boxes */}
      {[
        { x: -0.35, label: 'left' },
        { x: 0.35, label: 'right' },
      ].map(({ x, label }) => (
        <mesh
          key={`pants-${label}`}
          position={[x, -0.2, 0]}
          castShadow
          receiveShadow
          onPointerDown={(e) => {
            e.stopPropagation();
            setSelectedPart('pants');
          }}
        >
          <boxGeometry args={[0.55, 1.6, 0.7]} />
          <meshStandardMaterial
            color={partColors.pants}
            roughness={0.85}
            emissive={selectedPart === 'pants' ? '#be5c23' : '#000000'}
            emissiveIntensity={selectedPart === 'pants' ? 0.06 : 0}
          />
        </mesh>
      ))}

      {/* Soft ground shadow plane */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -1.01, 0]}
        receiveShadow
      >
        <planeGeometry args={[10, 10]} />
        <shadowMaterial opacity={0.18} />
      </mesh>
    </group>
  );
});

GiPlaceholderModel.displayName = 'GiPlaceholderModel';
