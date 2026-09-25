"""Convert one DZ_B_PRM STL to a cleaned, georeferenced GLB derivative.

Run with Blender 5.x in background mode. See README.dz-b-prm.md.
The raw STL is never modified; generated files go only to --output-dir.
"""

import argparse
import hashlib
import json
import os
import struct
import sys
from collections import defaultdict
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector


PARTS = {
    "environment": ("umgebung.stl", (0.561, 0.604, 0.639)),
    "zoo": ("zoo.stl", (0.847, 0.690, 0.478)),
    "bridge": ("bruecke.stl", (0.447, 0.663, 0.769)),
    "bridge-existing": ("bruecke-bestand.stl", (0.373, 0.498, 0.659)),
    "station": ("bergstation.stl", (0.722, 0.757, 0.486)),
}
ANCHOR_EPSG3857 = (791706.051, 6664825.628)
STL_TO_METERS = (3.19203, 3.19241, 2.0)


def arguments():
    separator = sys.argv.index("--") + 1 if "--" in sys.argv else len(sys.argv)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--part", required=True, choices=PARTS)
    parser.add_argument("--quality", required=True, choices=("2m", "5m", "original"))
    parser.add_argument("--input", required=True, type=Path, help="Source STL file")
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--weld-mm", type=float, default=0.00001)
    parser.add_argument("--max-instance-faces", type=int, default=256)
    parser.add_argument("--min-instances", type=int, default=3)
    parser.add_argument("--max-fit-error-m", type=float, default=0.005)
    parser.add_argument("--compression", choices=("none", "meshopt"), default="meshopt")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args(sys.argv[separator:])
    if not args.input.is_file():
        parser.error(f"STL not found: {args.input}")
    if args.weld_mm <= 0 or args.max_instance_faces < 4 or args.min_instances < 2:
        parser.error("weld-mm, max-instance-faces and min-instances must be positive")
    if args.max_fit_error_m <= 0:
        parser.error("max-fit-error-m must be positive")
    return args


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def binary_stl_triangle_count(path):
    with path.open("rb") as handle:
        handle.seek(80)
        raw = handle.read(4)
    if len(raw) != 4:
        return None
    count = struct.unpack("<I", raw)[0]
    return count if path.stat().st_size == 84 + 50 * count else None


def clean_mesh(mesh, weld_mm):
    before = (len(mesh.vertices), len(mesh.polygons))
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=weld_mm)
    bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=weld_mm)
    # Dissolving a degenerate edge can leave an n-gon. Make the face budget and
    # the exported GLB agree by triangulating before component analysis.
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    nonmanifold_edges = sum(len(edge.link_faces) != 2 for edge in bm.edges)
    bm.to_mesh(mesh)
    bm.free()
    mesh.validate(verbose=False)
    mesh.update()
    # STL contains facet geometry, not authored smoothing groups. Flat normals
    # keep roof/wall creases and shadow receiver normals deterministic.
    for polygon in mesh.polygons:
        polygon.use_smooth = False
    return {
        "before_vertices": before[0],
        "before_triangles": before[1],
        "after_vertices": len(mesh.vertices),
        "after_triangles": len(mesh.polygons),
        "nonmanifold_edges": nonmanifold_edges,
    }


def components_for_instancing(mesh, max_faces):
    parent = list(range(len(mesh.vertices)))
    rank = [1] * len(parent)

    def find(index):
        while index != parent[index]:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    for edge in mesh.edges:
        a, b = find(edge.vertices[0]), find(edge.vertices[1])
        if a != b:
            if rank[a] < rank[b]:
                a, b = b, a
            parent[b] = a
            rank[a] += rank[b]

    by_root = defaultdict(list)
    for polygon in mesh.polygons:
        by_root[find(polygon.vertices[0])].append(polygon.index)

    groups = defaultdict(list)
    data = {}
    for component_id, face_indices in by_root.items():
        if len(face_indices) > max_faces:
            continue
        vertex_ids = {}
        triangles = []
        for face_index in face_indices:
            triangle = []
            for vertex_id in mesh.polygons[face_index].vertices:
                if vertex_id not in vertex_ids:
                    vertex_ids[vertex_id] = len(vertex_ids)
                triangle.append(vertex_ids[vertex_id])
            triangles.append(tuple(triangle))
        # Identical connectivity is only a candidate; a vertex-by-vertex fit
        # below proves the actual geometry before any faces are replaced.
        oriented = lambda t: min((t[0], t[1], t[2]), (t[1], t[2], t[0]), (t[2], t[0], t[1]))
        topology = (len(vertex_ids), len(triangles), tuple(sorted(oriented(t) for t in triangles)))
        points = np.asarray(
            [mesh.vertices[index].co[:] for index in vertex_ids], dtype=np.float64
        )
        data[component_id] = (face_indices, triangles, points)
        groups[topology].append(component_id)
    return by_root, groups, data


def fit_trs(reference, target, max_error_m, fit_mask=None):
    if fit_mask is None:
        fit_mask = np.ones(len(reference), dtype=bool)
    a = np.column_stack((reference[fit_mask], np.ones(np.sum(fit_mask))))
    fit, _, rank, _ = np.linalg.lstsq(a, target[fit_mask], rcond=None)
    if rank != 4:
        return None, None, "rank"
    all_a = np.column_stack((reference, np.ones(len(reference))))
    errors = np.linalg.norm((all_a @ fit - target) * STL_TO_METERS, axis=1)
    if np.max(errors[fit_mask]) > max_error_m:
        return None, None, "shape"
    linear = fit[:3, :].T
    scales = np.linalg.norm(linear, axis=0)
    if np.min(scales) < 1e-8:
        return None, None, "singular"
    axes = linear / scales[np.newaxis, :]
    if np.max(np.abs(axes.T @ axes - np.eye(3))) > 0.001 or np.linalg.det(axes) <= 0:
        return None, None, "shear_or_mirror"

    matrix = Matrix(
        (
            (linear[0, 0], linear[0, 1], linear[0, 2], fit[3, 0]),
            (linear[1, 0], linear[1, 1], linear[1, 2], fit[3, 1]),
            (linear[2, 0], linear[2, 1], linear[2, 2], fit[3, 2]),
            (0, 0, 0, 1),
        )
    )
    location, rotation, scale = matrix.decompose()
    trs = Matrix.LocRotScale(location, rotation, scale)
    decomposed = np.asarray(trs, dtype=np.float64)
    predicted = reference @ decomposed[:3, :3].T + decomposed[:3, 3]
    decomposed_errors = np.linalg.norm((predicted - target) * STL_TO_METERS, axis=1)
    if np.max(decomposed_errors[fit_mask]) > max_error_m:
        return None, None, "decomposition"
    return trs, decomposed_errors, None


def discover_instance_families(groups, data, max_error_m, min_instances):
    accepted = []
    rejected = defaultdict(int)
    identity = Matrix.Identity(4)
    for members in groups.values():
        if len(members) < min_instances:
            continue
        families = []
        for component_id in members:
            target = data[component_id][2]
            for family in families:
                ref = data[family[0][0]][2]
                # Tree bases often meet a varying terrain height. Fit the
                # crown and upper stem, then retain any unstable lower faces.
                upper = ref[:, 2] > ref[:, 2].min() + np.ptp(ref[:, 2]) * 0.25
                if upper.sum() < 8 or (~upper).sum() == 0:
                    upper = np.ones(len(ref), dtype=bool)
                transform, errors, reason = fit_trs(ref, target, max_error_m, upper)
                if transform is not None:
                    family.append((component_id, transform, errors))
                    break
                rejected[reason] += 1
            else:
                families.append([(component_id, identity, np.zeros(len(target)))])
        accepted.extend(family for family in families if len(family) >= min_instances)
    return accepted, dict(rejected)


def make_material(part):
    material = bpy.data.materials.new(f"DZ_B_PRM {part} PBR")
    material.use_nodes = True
    material.use_backface_culling = False
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*PARTS[part][1], 1)
    shader.inputs["Roughness"].default_value = 0.88
    shader.inputs["Metallic"].default_value = 0.02
    return material


def materialize_instances(mesh, residual, root, families, data, material, max_error_m):
    removed_faces = []
    family_report = []
    for family_index, family in enumerate(families):
        reference_id = family[0][0]
        _, triangles, reference = data[reference_id]
        stable = np.ones(len(reference), dtype=bool)
        for _, _, errors in family:
            stable &= errors <= max_error_m
        shared_triangles = [
            triangle for triangle in triangles if all(stable[index] for index in triangle)
        ]
        if not shared_triangles:
            continue
        shared_keys = {tuple(sorted(triangle)) for triangle in shared_triangles}
        used_vertices = sorted({index for triangle in shared_triangles for index in triangle})
        vertex_map = {index: offset for offset, index in enumerate(used_vertices)}
        center = np.mean(reference[used_vertices], axis=0)
        template = bpy.data.meshes.new(f"repeat-{family_index:04d}")
        template.from_pydata(
            (reference[used_vertices] - center).tolist(),
            [],
            [tuple(vertex_map[index] for index in triangle) for triangle in shared_triangles],
        )
        template.update()
        for polygon in template.polygons:
            polygon.use_smooth = False
        template.materials.append(material)
        parent = bpy.data.objects.new(f"repeat-{family_index:04d}-instances", None)
        bpy.context.collection.objects.link(parent)
        parent.parent = root
        for instance_index, (component_id, raw_transform, _) in enumerate(family):
            child = bpy.data.objects.new(
                f"repeat-{family_index:04d}-{instance_index:04d}", template
            )
            bpy.context.collection.objects.link(child)
            child.parent = parent
            transform = raw_transform.copy()
            offset = raw_transform.to_3x3() @ Vector(center.tolist())
            transform.translation += offset
            child.matrix_basis = transform
            face_indices, component_triangles, _ = data[component_id]
            removed_faces.extend(
                face_index
                for face_index, triangle in zip(face_indices, component_triangles)
                if tuple(sorted(triangle)) in shared_keys
            )
        family_report.append(
            {
                "instances": len(family),
                "shared_triangles_per_instance": len(shared_triangles),
                "unique_contact_triangles_per_instance": len(triangles) - len(shared_triangles),
                "max_unshared_vertex_error_m": max(
                    float(np.max(errors)) for _, _, errors in family
                ),
            }
        )

    if removed_faces:
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bm.faces.ensure_lookup_table()
        bmesh.ops.delete(
            bm,
            geom=[bm.faces[index] for index in removed_faces],
            context="FACES",
        )
        bm.to_mesh(mesh)
        bm.free()
        mesh.update()
    if not mesh.polygons:
        bpy.data.objects.remove(residual, do_unlink=True)
    return family_report, len(removed_faces)


def glb_summary(path):
    with path.open("rb") as handle:
        magic, version, _ = struct.unpack("<4sII", handle.read(12))
        if magic != b"glTF" or version != 2:
            raise ValueError("Blender did not write a glTF 2.0 GLB")
        json_length, chunk_type = struct.unpack("<II", handle.read(8))
        if chunk_type != 0x4E4F534A:
            raise ValueError("GLB has no JSON first chunk")
        document = json.loads(handle.read(json_length))
    return {
        "meshes": len(document.get("meshes", [])),
        "nodes": len(document.get("nodes", [])),
        "extensions_used": document.get("extensionsUsed", []),
        "gpu_instance_nodes": sum(
            "EXT_mesh_gpu_instancing" in node.get("extensions", {})
            for node in document.get("nodes", [])
        ),
        "missing_normal_primitives": sum(
            "NORMAL" not in primitive.get("attributes", {})
            for item in document.get("meshes", [])
            for primitive in item.get("primitives", [])
        ),
    }


def main():
    args = arguments()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    glb = args.output_dir / f"{args.part}.glb"
    report_path = args.output_dir / f"{args.part}.asset.json"
    temporary_glb = args.output_dir / f".{args.part}.building.glb"
    if temporary_glb.exists():
        raise FileExistsError(f"Remove stale temporary export first: {temporary_glb}")
    if not args.overwrite and (glb.exists() or report_path.exists()):
        raise FileExistsError(f"Output exists; use a new directory or --overwrite: {glb}")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    raw_triangles = binary_stl_triangle_count(args.input)
    bpy.ops.wm.stl_import(filepath=str(args.input), use_mesh_validate=True)
    residual = bpy.context.selected_objects[0]
    mesh = residual.data
    cleanup = clean_mesh(mesh, args.weld_mm)
    raw_bounds = [
        [min(vertex.co[axis] for vertex in mesh.vertices) for axis in range(3)],
        [max(vertex.co[axis] for vertex in mesh.vertices) for axis in range(3)],
    ]

    root = bpy.data.objects.new("DZ_B_PRM-local-meters", None)
    bpy.context.collection.objects.link(root)
    root.scale = STL_TO_METERS
    root["horizontal_crs"] = "EPSG:3857"
    root["vertical_datum"] = "DHHN2016"
    root["anchor_easting_m"] = ANCHOR_EPSG3857[0]
    root["anchor_northing_m"] = ANCHOR_EPSG3857[1]
    residual.name = f"{args.part}-unique-geometry"
    residual.parent = root
    material = make_material(args.part)
    mesh.materials.clear()
    mesh.materials.append(material)

    components, groups, data = components_for_instancing(mesh, args.max_instance_faces)
    families, rejected = discover_instance_families(
        groups, data, args.max_fit_error_m, args.min_instances
    )
    family_report, removed_faces = materialize_instances(
        mesh, residual, root, families, data, material, args.max_fit_error_m
    )

    if args.compression == "meshopt":
        # Blender 5.2's current Meshopt exporter hardcodes 12-bit exponential
        # float filtering for POSITION and instance TRANSLATION. Across this
        # kilometre-sized model that moves coordinates by decimetres. Keep the
        # established EXT_meshopt_compression format, but raise its filter
        # precision before invoking Blender's exporter.
        from io_scene_gltf2.io.exp import meshopt

        meshopt.EXP_FILTER_BITS = 20

    bpy.ops.export_scene.gltf(
        filepath=str(temporary_glb),
        export_format="GLB",
        export_yup=True,
        export_gpu_instances=True,
        export_meshopt_compression_enable=args.compression == "meshopt",
        export_meshopt_extension="EXT_meshopt_compression",
        export_normals=True,
        export_extras=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
    )
    summary = glb_summary(temporary_glb)
    if summary["missing_normal_primitives"]:
        raise ValueError("Exported GLB is missing vertex normals")
    if families and summary["gpu_instance_nodes"] == 0:
        raise ValueError("Exporter failed to emit EXT_mesh_gpu_instancing")
    if args.compression == "meshopt" and "EXT_meshopt_compression" not in summary["extensions_used"]:
        raise ValueError("Exporter failed to emit EXT_meshopt_compression")

    url_folder = "full" if args.quality == "original" else args.quality
    source_name = PARTS[args.part][0]
    report = {
        "format": "glTF 2.0 GLB",
        "source": {
            "url": f"https://adhocdata.cismet.de/DZ_B_PRM/{url_folder}/{source_name}",
            "sha256": sha256(args.input),
            "bytes": args.input.stat().st_size,
            "binary_stl_triangles": raw_triangles,
        },
        "conversion": {
            "blender_version": bpy.app.version_string,
            "weld_mm": args.weld_mm,
            "max_fit_error_m": args.max_fit_error_m,
            "max_instance_faces": args.max_instance_faces,
            "min_instances": args.min_instances,
            "compression": args.compression,
            "meshopt_exponential_bits": 20 if args.compression == "meshopt" else None,
            "cleanup": cleanup,
            "connected_components": len(components),
            "candidate_components": len(data),
            "gpu_instance_families": {
                "count": len(family_report),
                "instances": sum(family["instances"] for family in family_report),
                "max_unshared_vertex_error_m": max(
                    (family["max_unshared_vertex_error_m"] for family in family_report),
                    default=0,
                ),
            },
            "triangles_replaced_by_instances": removed_faces,
            "rejected_fits": rejected,
        },
        "georeference": {
            "horizontal_crs": "EPSG:3857",
            "anchor_xy_m": ANCHOR_EPSG3857,
            "vertical_datum": "DHHN2016",
            "stl_xyz_to_local_meters": STL_TO_METERS,
            "gltf_axes": "X=east, Y=up (absolute DHHN2016 metres), Z=south",
            "raw_stl_bounds": raw_bounds,
            "mercator_bounds_xy_m": [
                [ANCHOR_EPSG3857[0] + raw_bounds[0][0] * STL_TO_METERS[0],
                 ANCHOR_EPSG3857[1] + raw_bounds[0][1] * STL_TO_METERS[1]],
                [ANCHOR_EPSG3857[0] + raw_bounds[1][0] * STL_TO_METERS[0],
                 ANCHOR_EPSG3857[1] + raw_bounds[1][1] * STL_TO_METERS[1]],
            ],
        },
        "glb": summary,
        "limitations": [
            "Only exact-enough TRS copies with matching oriented triangle topology are GPU-instanced; sheared/mirrored and ambiguous components remain ordinary geometry.",
            "Repeated upper geometry may be instanced while varying terrain-contact faces remain unique; no inferred trunk geometry is fabricated.",
            "Duplicate/degenerate triangles are removed, but arbitrary coplanar overlaps or conflicting alternative insets need separate inspection.",
            "Bare STL contains no semantic tree/building labels; repeated families are not semantically classified.",
        ],
    }
    os.replace(temporary_glb, glb)
    report["glb"]["sha256"] = sha256(glb)
    report["glb"]["bytes"] = glb.stat().st_size
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"glb": str(glb), "report": str(report_path), "summary": summary}))


if __name__ == "__main__":
    main()
