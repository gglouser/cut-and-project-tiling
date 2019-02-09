#[macro_use]
extern crate cfg_if;

extern crate wasm_bindgen;
use wasm_bindgen::prelude::*;

extern crate vectors;

use std::f64::{EPSILON};
use std::f64::consts::{FRAC_1_SQRT_2, PI};
use vectors::Dot;
use vectors::dense::heap::DenseVector;

cfg_if! {
    // When the `console_error_panic_hook` feature is enabled, we can call the
    // `set_panic_hook` function to get better error messages if we ever panic.
    if #[cfg(feature = "console_error_panic_hook")] {
        extern crate console_error_panic_hook;
        use console_error_panic_hook::set_once as set_panic_hook;
    } else {
        #[inline]
        fn set_panic_hook() {}
    }
}

cfg_if! {
    // When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
    // allocator.
    if #[cfg(feature = "wee_alloc")] {
        extern crate wee_alloc;
        #[global_allocator]
        static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;
    }
}

type PPoint = (f64, f64);

#[wasm_bindgen]
#[derive(Clone, Debug)]
pub struct Face {
    pub vert0x: f64,
    pub vert0y: f64,
    pub vert1x: f64,
    pub vert1y: f64,
    pub vert2x: f64,
    pub vert2y: f64,
    pub vert3x: f64,
    pub vert3y: f64,
    pub face_type: u16,
}

#[wasm_bindgen]
pub struct MultigridTiling {
    pub dims: u16,
    pub view_width: f64,
    pub view_height: f64,
    basis: [DenseVector<f64>; 2],
    offset: DenseVector<f64>,
    faces: Vec<Face>,
}

#[wasm_bindgen]
impl MultigridTiling {

    #[wasm_bindgen(constructor)]
    pub fn new(dims: u16, view_width: f64, view_height: f64) -> Self {
        set_panic_hook();
        let zero = DenseVector::from(vec![0.0; dims as usize]);
        let mut tiling = MultigridTiling {
            dims,
            view_width,
            view_height,
            basis: [zero.clone(), zero.clone()],
            offset: zero,
            faces: vec![],
        };
        tiling.reset_basis();
        tiling.reset_offset();
        tiling.new_params();
        tiling
    }

    pub fn get_basis(&self, i: usize) -> Box<[f64]> {
        self.basis[i].iter().map(|(_, x)| x).collect()
    }

    pub fn set_basis(&mut self, i: usize, vals: &[f64]) {
        self.basis[i] = DenseVector::from(vals.to_owned());
    }

    pub fn get_offset(&self) -> Box<[f64]> {
        self.offset.iter().map(|(_, x)| x).collect()
    }

    pub fn set_offset(&mut self, vals: &[f64]) {
        self.offset = DenseVector::from(vals.to_owned());
    }

    #[wasm_bindgen(js_name = setOffsetComp)]
    pub fn set_offset_comp(&mut self, j: usize, val: f64) {
        let mut offset: Vec<f64> = self.offset.iter().map(|(_,c)| c).collect();
        offset[j] = val;
        self.offset = DenseVector::from(offset);
    }

    pub fn get_num_faces(&self) -> usize {
        self.faces.len()
    }

    pub fn get_face(&self, i: usize) -> Face {
        self.faces[i].clone()
    }

    // Set up the default basis vectors for the cutting plane.
    #[wasm_bindgen(js_name = resetBasis)]
    pub fn reset_basis(&mut self) {
        let f = (2.0/self.dims as f64).sqrt();
        let g = ((self.dims % 2) + 1) as f64 * PI / self.dims as f64;
        self.basis[0] = (0..self.dims).map(|i| f * (g*i as f64).cos()).collect();
        self.basis[1] = (0..self.dims).map(|i| f * (g*i as f64).sin()).collect();
    }

    // Set the default offset for the cutting plane.
    #[wasm_bindgen(js_name = resetOffset)]
    pub fn reset_offset(&mut self) {
        let gamma = if self.dims == 5 { 0.3 } else { 0.0 };
        self.offset = DenseVector::from(vec![gamma; self.dims as usize]);
    }

    #[wasm_bindgen(js_name = newParams)]
    pub fn new_params(&mut self) {
        let axis = self.get_axes();
        let ext_prod = get_ext_products(self.dims as usize, &axis);
        let offset: Vec<f64> = self.offset.iter().map(|(_,x)| x).collect();
        let hbound = self.view_width/2.0 + FRAC_1_SQRT_2;
        let vbound = self.view_height/2.0 + FRAC_1_SQRT_2;
        let (grid_min, grid_max) = self.get_grid_ranges(hbound, vbound);
        let face_types = get_face_types(self.dims as usize);

        self.faces.clear();
        for i in 0..self.dims as usize - 1 {
            for j in i+1..self.dims as usize {
                if ext_prod[i][j].abs() < EPSILON {
                    // Axis i and axis j are parallel.
                    // Faces with this orientation have zero area / are perpendicular
                    // to the cut plane, so they do not produce tiles.
                    continue;
                }

                for ki in grid_min[i]..grid_max[i] {
                    for kj in grid_min[j]..grid_max[j] {
                        let face_vert = self.get_face_vertex(i, j,
                            ki as f64, kj as f64,
                            &axis, &ext_prod, &offset);
                        let f1 = self.project(face_vert);

                        let mid_x = f1.0 + (axis[i].0 + axis[j].0)/2.0;
                        let mid_y = f1.1 + (axis[i].1 + axis[j].1)/2.0;
                        if mid_x.abs() > hbound || mid_y.abs() > vbound {
                            continue;
                        }

                        let f2 = (f1.0 + axis[i].0, f1.1 + axis[i].1);
                        let f3 = (f2.0 + axis[j].0, f2.1 + axis[j].1);
                        let f4 = (f1.0 + axis[j].0, f1.1 + axis[j].1);
                        self.faces.push( Face {
                            vert0x: f1.0,
                            vert0y: f1.1,
                            vert1x: f2.0,
                            vert1y: f2.1,
                            vert2x: f3.0,
                            vert2y: f3.1,
                            vert3x: f4.0,
                            vert3y: f4.1,
                            face_type: face_types[i][j],
                        });
                    }
                }
            }
        }
    }

    fn get_face_vertex(
        &self,
        i: usize,
        j: usize,
        ki: f64,
        kj: f64,
        axis: &[PPoint],
        ext_prod: &[Vec<f64>],
        offset: &[f64],
    ) -> DenseVector<f64> {
        // Find the intersection (a,b) of the grid lines ki and kj.
        let a = ((ki + 0.5 - offset[i])*axis[j].1 - (kj + 0.5 - offset[j])*axis[i].1)
            / ext_prod[i][j];
        let b = ((kj + 0.5 - offset[j])*axis[i].0 - (ki + 0.5 - offset[i])*axis[j].0)
            / ext_prod[i][j];

        // Find the coordinates of the key vertex for the face
        // corresponding to this intersection.
        self.unproject((a, b)).iter().map(|(ix, x)| {
            if ix == i {
                return ki;
            } else if ix == j {
                return kj;
            }

            // Check for multiple intersections. If the fractional part of this coord
            // is 0.5, then it is on one of the grid lines for ix.
            if (x - x.floor() - 0.5).abs() < 1e-10 {
                if ext_prod[i][ix].abs() < EPSILON {
                    // Axis i and ix are parallel. Shift the tile in the
                    // ix direction if they point the same direction
                    // AND this is the tile such that ix < i.
                    if axis[ix].0*axis[i].0 + axis[ix].1*axis[i].1 > 0.0 && ix < i {
                        return x.ceil();
                    }
                    return x.floor();
                } else if ext_prod[ix][j].abs() < EPSILON {
                    // Axis j and ix are parallel. Shift the tile in the
                    // ix direction if they point the same direction
                    // AND this is the tile such that ix < j.
                    if axis[ix].0*axis[j].0 + axis[ix].1*axis[j].1 > 0.0 && ix < j {
                        return x.ceil();
                    }
                    return x.floor();
                } else if ext_prod[i][j]*ext_prod[i][ix] > 0.0
                            && ext_prod[i][j]*ext_prod[ix][j] > 0.0 {
                    // Axis ix lies between axis i and axis j. Shift the tile
                    // in the ix direction by rounding up instead of down.
                    return x.ceil();
                }
                return x.floor();
            }
            x.round()
        })
        .collect()
    }

    // Move offset by a small delta along the cutting plane.
    #[wasm_bindgen(js_name = translateOffset)]
    pub fn translate_offset(&mut self, du: f64, dv: f64) {
        let new_offset = self.unproject((du, dv));
        self.offset = new_offset.iter()
            .map(|(_, x)| x - x.floor())
            .collect();
    }

    // Alter the orientation of the cutting plane so that the unit
    // vector of the given axis has coordinates (x,y) when projected
    // onto the cutting plane.
    #[wasm_bindgen(js_name = moveAxis)]
    pub fn move_axis(&mut self, axis: usize, x: f64, y: f64) {
        // Get the unit vector in direction (x,y) and clamp k to <= 1.0.
        let k = x.hypot(y);
        let (unit_x, unit_y, k) = if k <= EPSILON {
            (1.0, 0.0, 0.0)
        } else {
            (x/k, y/k, k.min(1.0))
        };

        // Convenient aliases for the basis vectors.
        let u = self.basis[0].clone();
        let v = self.basis[1].clone();

        // Rotate u and v so that u is nearly aligned with the change axis.
        let (u,v) = (
            u.clone() * unit_x + v.clone() * unit_y,
            u * (-unit_y) + v * unit_x
        );

        // k-normalize v orthogonal to the change axis.
        let v = knormalize(v, axis, 0.0);

        // Make u orthogonal to v then k-normalize fully aligned with the change axis.
        let u = knormalize(make_ortho(u, &v), axis, k);

        // Rotate u and v to new direction.
        self.basis[0] = u.clone() * unit_x + v.clone() * (-unit_y);
        self.basis[1] = u * unit_y + v * unit_x;
    }

    // Project a point in space onto the view plane.
    fn project(&self, v: DenseVector<f64>) -> PPoint {
        let v1 = v - &self.offset;
        (v1.dot(&self.basis[0]), v1.dot(&self.basis[1]))
    }

    // Take a point on the view plane to the corresponding point in space.
    fn unproject(&self, (x,y): PPoint) -> DenseVector<f64> {
        self.basis[0].clone() * x
            + self.basis[1].clone() * y
            + &self.offset
    }

    // It will be useful to have the projection of each axis on the view plane.
    // This is the same as the transpose of the basis.
    fn get_axes(&self) -> Vec<PPoint> {
        self.basis[0].iter().map(|(_,x)| x)
            .zip(self.basis[1].iter().map(|(_,y)| y))
            .collect()
    }

    // Find the range of grid lines for each axis.
    fn get_grid_ranges(&self, hbound: f64, vbound: f64) -> (Vec<i32>, Vec<i32>) {
        let corners = [
            self.unproject((-hbound, -vbound)),
            self.unproject((-hbound,  vbound)),
            self.unproject(( hbound, -vbound)),
            self.unproject(( hbound,  vbound)),
        ];
        let mut grid_min = vec![std::i32::MAX; self.dims as usize];
        let mut grid_max = vec![std::i32::MIN; self.dims as usize];
        corners.iter().for_each(|corner| {
            corner.iter().for_each(|(i, x)| {
                grid_min[i] = grid_min[i].min(x.floor() as i32);
                grid_max[i] = grid_max[i].max(x.ceil() as i32);
            });
        });
        (grid_min, grid_max)
    }
}

fn make_ortho(v: DenseVector<f64>, w: &DenseVector<f64>) -> DenseVector<f64> {
    let mu = v.dot(w);
    v - w.clone() * mu
}

// Change v to have a norm of 1, BUT with the extra constraint
// that v[axis] == k (0 <= k <= 1).
fn knormalize(v: DenseVector<f64>, axis: usize, k: f64) -> DenseVector<f64> {
    assert!(0.0 <= k && k <= 1.0);
    let norm2 = 1.0 - k.powi(2);
    let v_norm2 = v.iter().fold(0.0, |a, (i,x)| if i == axis { a } else { a + x.powi(2) });
    if v_norm2 > EPSILON {
        let f = (norm2 / v_norm2).sqrt();
        v.iter().map(|(i, x)| if i == axis { k } else { x*f }).collect()
    } else {
        let x = (norm2 / (v.len() as f64 - 1.0)).sqrt();
        v.iter().map(|(i, _)| if i == axis { k } else { -x }).collect()
    }
}

// It will be useful to have the exterior products (aka perp dot product)
// of each pair of axes.
fn get_ext_products(dims: usize, axis: &[PPoint]) -> Vec<Vec<f64>> {
    let mut prods = vec![vec![0.0; dims]; dims];
    for i in 0..dims {
        for j in 0..i {
            prods[i][j] = axis[i].0*axis[j].1 - axis[j].0*axis[i].1;
            prods[j][i] = -prods[i][j];
        }
    }
    prods
}

fn get_face_types(dims: usize) -> Vec<Vec<u16>> {
    let mut face_types = vec![vec![0; dims]; dims];
    let mut type_index = 0;
    for i in 0..dims-1 {
        for j in i+1..dims {
            face_types[i][j] = type_index;
            face_types[j][i] = type_index;
            type_index += 1;
        }
    }
    face_types
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn multigrid() {
        let tiling = MultigridTiling::new(5, 16.0, 9.0);
        assert_eq!(552, tiling.faces.len());
    }
}
