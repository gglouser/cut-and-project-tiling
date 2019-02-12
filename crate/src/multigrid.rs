use std::f64::EPSILON;
use std::f64::consts::FRAC_1_SQRT_2;
use num_traits::ops::mul_add::MulAdd;
use vectors::Dot;
use vectors::dense::heap::DenseVector;
use wasm_bindgen::prelude::*;

use crate::{FaceList, Face, set_panic_hook};

type PPoint = (f64, f64);

struct State {
    dims: usize,
    basis: [DenseVector<f64>; 2],
    offset: DenseVector<f64>,
    axis: Vec<PPoint>,
    offvec: Vec<f64>,
    ext_prod: Vec<Vec<f64>>,
}

impl State {
    fn new(dims: usize, basis0: &[f64], basis1: &[f64], offset: &[f64]) -> Self {
        let axis = get_axes(basis0, basis1);
        let offvec = offset.to_owned();
        let ext_prod = get_ext_products(&axis);
        State {
            dims,
            basis: [DenseVector::from(basis0.to_owned()), DenseVector::from(basis1.to_owned())],
            offset: DenseVector::from(offvec.clone()),
            axis,
            offvec,
            ext_prod,
        }
    }

    // Project a point in space onto the view plane.
    fn project(&self, v: DenseVector<f64>) -> PPoint {
        let v1 = v - &self.offset;
        (v1.dot(&self.basis[0]), v1.dot(&self.basis[1]))
    }

    // Take a point on the view plane to the corresponding point in space.
    fn unproject(&self, (x,y): PPoint) -> DenseVector<f64> {
        self.basis[0].clone().mul_add(x,
            self.basis[1].clone().mul_add(y,
                &self.offset))
    }

    // Find the range of grid lines for each axis.
    fn get_grid_ranges(&self, hbound: f64, vbound: f64) -> (Vec<i32>, Vec<i32>) {
        let corners = [
            self.unproject((-hbound, -vbound)),
            self.unproject((-hbound,  vbound)),
            self.unproject(( hbound, -vbound)),
            self.unproject(( hbound,  vbound)),
        ];
        let mut grid_min = vec![std::i32::MAX; self.dims];
        let mut grid_max = vec![std::i32::MIN; self.dims];
        corners.iter().for_each(|corner| {
            corner.iter().for_each(|(i, x)| {
                grid_min[i] = grid_min[i].min(x.floor() as i32);
                grid_max[i] = grid_max[i].max(x.ceil() as i32);
            });
        });
        (grid_min, grid_max)
    }

    fn get_face_vertex(&self, i: usize, j: usize, ki: f64, kj: f64) -> DenseVector<f64> {
        // Find the intersection (a,b) of the grid lines ki and kj.
        let u = ki + 0.5 - self.offvec[i];
        let v = kj + 0.5 - self.offvec[j];
        let a = (u*self.axis[j].1 - v*self.axis[i].1) / self.ext_prod[i][j];
        let b = (v*self.axis[i].0 - u*self.axis[j].0) / self.ext_prod[i][j];

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
                if self.ext_prod[i][ix].abs() < EPSILON {
                    // Axis i and ix are parallel. Shift the tile in the
                    // ix direction if they point the same direction
                    // AND this is the tile such that ix < i.
                    if self.axis[ix].0*self.axis[i].0 + self.axis[ix].1*self.axis[i].1 > 0.0 && ix < i {
                        return x.ceil();
                    }
                } else if self.ext_prod[ix][j].abs() < EPSILON {
                    // Axis j and ix are parallel. Shift the tile in the
                    // ix direction if they point the same direction
                    // AND this is the tile such that ix < j.
                    if self.axis[ix].0*self.axis[j].0 + self.axis[ix].1*self.axis[j].1 > 0.0 && ix < j {
                        return x.ceil();
                    }
                } else if self.ext_prod[i][j]*self.ext_prod[i][ix] > 0.0
                            && self.ext_prod[i][j]*self.ext_prod[ix][j] > 0.0 {
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
}

// It will be useful to have the projection of each axis on the view plane.
// This is the same as the transpose of the basis.
fn get_axes(basis0: &[f64], basis1: &[f64]) -> Vec<PPoint> {
    basis0.iter().cloned().zip(basis1.iter().cloned()).collect()
}

// It will be useful to have the exterior products (aka perp dot product)
// of each pair of axes.
fn get_ext_products(axis: &[PPoint]) -> Vec<Vec<f64>> {
    let mut prods = vec![vec![0.0; axis.len()]; axis.len()];
    for i in 0..axis.len() {
        for j in 0..i {
            prods[i][j] = axis[i].0*axis[j].1 - axis[j].0*axis[i].1;
            prods[j][i] = -prods[i][j];
        }
    }
    prods
}

#[wasm_bindgen]
pub fn generate(
    dims: usize,
    basis0: &[f64],
    basis1: &[f64],
    offset: &[f64],
    view_width: f64,
    view_height: f64,
) -> FaceList {
    set_panic_hook();

    let state = State::new(dims, basis0, basis1, offset);
    let hbound = view_width/2.0 + FRAC_1_SQRT_2;
    let vbound = view_height/2.0 + FRAC_1_SQRT_2;
    let (grid_min, grid_max) = state.get_grid_ranges(hbound, vbound);
    let face_types = get_face_types(dims);

    let mut faces = Vec::new();
    for i in 0..dims - 1 {
        for j in i+1..dims {
            if state.ext_prod[i][j].abs() < EPSILON {
                // Axis i and axis j are parallel.
                // Faces with this orientation have zero area / are perpendicular
                // to the cut plane, so they do not produce tiles.
                continue;
            }

            for ki in grid_min[i]..grid_max[i] {
                for kj in grid_min[j]..grid_max[j] {
                    let face_vert = state.get_face_vertex(i, j, f64::from(ki), f64::from(kj));
                    let f1 = state.project(face_vert);

                    let mid_x = f1.0 + (state.axis[i].0 + state.axis[j].0)/2.0;
                    let mid_y = f1.1 + (state.axis[i].1 + state.axis[j].1)/2.0;
                    if mid_x.abs() > hbound || mid_y.abs() > vbound {
                        continue;
                    }

                    let f2 = (f1.0 + state.axis[i].0, f1.1 + state.axis[i].1);
                    let f3 = (f2.0 + state.axis[j].0, f2.1 + state.axis[j].1);
                    let f4 = (f1.0 + state.axis[j].0, f1.1 + state.axis[j].1);
                    faces.push( Face {
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
    FaceList { faces }
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
