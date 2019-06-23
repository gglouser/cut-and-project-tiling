use std::f64::EPSILON;
use std::f64::consts::FRAC_1_SQRT_2;
use nalgebra::{DVector, RowDVector, Vector2, MatrixMN, Dynamic, U2};
use wasm_bindgen::prelude::*;

use crate::{FaceList, Face, set_panic_hook};

struct State {
    dims: usize,
    basis: MatrixMN<f64, U2, Dynamic>,
    offset: DVector<f64>,
    ext_prod: Vec<Vec<f64>>,
}

impl State {
    fn new(dims: usize, basis0: &[f64], basis1: &[f64], offset: &[f64]) -> Self {
        let basis = MatrixMN::from_rows(&[
                RowDVector::from_row_slice(basis0),
                RowDVector::from_row_slice(basis1),
            ]);
        let ext_prod = get_ext_products(&basis);
        State {
            basis,
            dims,
            offset: DVector::from_column_slice(offset),
            ext_prod,
        }
    }

    // Project a point in space onto the view plane.
    fn project(&self, v: DVector<f64>) -> Vector2<f64> {
        &self.basis * (v - &self.offset)
    }

    // Take a point on the view plane to the corresponding point in space.
    fn unproject(&self, p: Vector2<f64>) -> DVector<f64> {
        self.basis.tr_mul(&p) + &self.offset
    }

    // Find the range of grid lines for each axis.
    fn get_grid_ranges(&self, hbound: f64, vbound: f64) -> (Vec<i32>, Vec<i32>) {
        let corners = [
            self.unproject(Vector2::new(-hbound, -vbound)),
            self.unproject(Vector2::new(-hbound,  vbound)),
            self.unproject(Vector2::new( hbound, -vbound)),
            self.unproject(Vector2::new( hbound,  vbound)),
        ];
        let mut grid_min = vec![std::i32::MAX; self.dims];
        let mut grid_max = vec![std::i32::MIN; self.dims];
        corners.iter().for_each(|corner| {
            corner.iter().enumerate().for_each(|(i, x)| {
                grid_min[i] = grid_min[i].min(x.floor() as i32);
                grid_max[i] = grid_max[i].max(x.ceil() as i32);
            });
        });
        (grid_min, grid_max)
    }

    fn get_face_vertex(&self, i: usize, j: usize, ki: f64, kj: f64) -> DVector<f64> {
        // Find the intersection (a,b) of the grid lines ki and kj.
        let u = ki + 0.5 - self.offset[i];
        let v = kj + 0.5 - self.offset[j];
        let a = (u*self.basis[(1,j)] - v*self.basis[(1,i)]) / self.ext_prod[i][j];
        let b = (v*self.basis[(0,i)] - u*self.basis[(0,j)]) / self.ext_prod[i][j];

        // Find the coordinates of the key vertex for the face
        // corresponding to this intersection.
        self.unproject(Vector2::new(a, b)).map_with_location(|ix, _, x| {
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
                    if self.basis.column(ix).dot(&self.basis.column(i)) > 0.0 && ix < i {
                        // eprintln!("singular case A {} {} {} {}", i, j, ki, kj);
                        return x.ceil();
                    }
                } else if self.ext_prod[ix][j].abs() < EPSILON {
                    // Axis j and ix are parallel. Shift the tile in the
                    // ix direction if they point the same direction
                    // AND this is the tile such that ix < j.
                    if self.basis.column(ix).dot(&self.basis.column(j)) > 0.0 && ix < j {
                        // eprintln!("singular case B {} {} {} {}", i, j, ki, kj);
                        return x.ceil();
                    }
                } else if self.ext_prod[i][j]*self.ext_prod[i][ix] > 0.0
                            && self.ext_prod[i][j]*self.ext_prod[ix][j] > 0.0 {
                    // Axis ix lies between axis i and axis j. Shift the tile
                    // in the ix direction by rounding up instead of down.
                    // eprintln!("singular case C {} {} {} {}", i, j, ki, kj);
                    return x.ceil();
                }
                // eprintln!("singular case D {} {} {} {}", i, j, ki, kj);
                return x.floor();
            }
            x.round()
        })
    }
}

// It will be useful to have the exterior products (aka perp dot product)
// of each pair of axes.
fn get_ext_products(basis: &MatrixMN<f64, U2, Dynamic>) -> Vec<Vec<f64>> {
    let mut prods = vec![vec![0.0; basis.ncols()]; basis.ncols()];
    for i in 1..basis.ncols() {
        for j in 0..i {
            prods[i][j] = basis.column(i).perp(&basis.column(j));
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

                    let mid = f1 + (state.basis.column(i) + state.basis.column(j)) / 2.0;
                    if mid[0].abs() > hbound || mid[1].abs() > vbound {
                        continue;
                    }

                    faces.push( Face {
                        key_vert_x: f1[0],
                        key_vert_y: f1[1],
                        axis1: i as u16,
                        axis2: j as u16,
                    });
                }
            }
        }
    }
    FaceList { faces }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn generate_penrose() {
        let dims = 5;
        let f = (2.0/dims as f64).sqrt();
        let g = (dims % 2 + 1) as f64 * std::f64::consts::PI / dims as f64;
        let basis0: Vec<_> = (0..dims).map(|x| f * (g * x as f64).cos()).collect();
        let basis1: Vec<_> = (0..dims).map(|x| f * (g * x as f64).sin()).collect();
        let offset: Vec<_> = (0..dims).map(|_| 0.3).collect();
        let view_width = 10.0;
        let view_height = 10.0;
        let faces = generate(dims, &basis0, &basis1, &offset, view_width, view_height);
        assert_eq!(406, faces.get_num_faces());
    }

    #[test]
    fn generate_singular() {
        // Test singular multigrid.
        let dims = 5;
        let f = (2.0/dims as f64).sqrt();
        let g = (dims % 2 + 1) as f64 * std::f64::consts::PI / dims as f64;
        let basis0: Vec<_> = (0..dims).map(|x| f * (g * x as f64).cos()).collect();
        let basis1: Vec<_> = (0..dims).map(|x| f * (g * x as f64).sin()).collect();
        let offset: Vec<_> = (0..dims).map(|_| 0.5).collect();
        let view_width = 10.0;
        let view_height = 10.0;
        let faces = generate(dims, &basis0, &basis1, &offset, view_width, view_height);
        assert_eq!(416, faces.get_num_faces());
    }

    #[test]
    fn generate_singular_a() {
        // Test singular case A -- parallel axes #1.
        let basis0 = [0.0, 0.0, 1.0];
        let basis1 = [FRAC_1_SQRT_2, FRAC_1_SQRT_2, 0.0];
        let offset = [0.0; 3];
        let state = State::new(3, &basis0, &basis1, &offset);
        let face_vert = state.get_face_vertex(1, 2, 0.0, 0.0);
        assert_eq!(face_vert, DVector::from_column_slice(&[1.0, 0.0, 0.0]));
    }

    #[test]
    fn generate_singular_b() {
        // Test singular case B -- parallel axes #2.
        let basis0 = [1.0, 0.0, 0.0];
        let basis1 = [0.0, FRAC_1_SQRT_2, FRAC_1_SQRT_2];
        let offset = [0.0; 3];
        let state = State::new(3, &basis0, &basis1, &offset);
        let face_vert = state.get_face_vertex(0, 2, 0.0, 0.0);
        assert_eq!(face_vert, DVector::from_column_slice(&[0.0, 1.0, 0.0]));
    }

    #[test]
    fn generate_singular_c() {
        // Test singular case C -- axis between non-parallel axes.
        let f = (2.0f64/3.0).sqrt();
        let basis0 = [f, f/2.0, f/2.0];
        let basis1 = [0.0, FRAC_1_SQRT_2, -FRAC_1_SQRT_2];
        let offset = [0.5; 3];
        let state = State::new(3, &basis0, &basis1, &offset);
        let face_vert = state.get_face_vertex(1, 2, 0.0, 0.0);
        assert_eq!(face_vert, DVector::from_column_slice(&[1.0, 0.0, 0.0]));
    }

    #[test]
    fn generate_singular_d() {
        // Test singular case D -- axis not between non-parallel axes.
        let f = (2.0f64/3.0).sqrt();
        let basis0 = [f, f/2.0, f/2.0];
        let basis1 = [0.0, FRAC_1_SQRT_2, -FRAC_1_SQRT_2];
        let offset = [0.5; 3];
        let state = State::new(3, &basis0, &basis1, &offset);
        let face_vert = state.get_face_vertex(0, 1, 0.0, 0.0);
        assert_eq!(face_vert, DVector::from_column_slice(&[0.0, 0.0, 0.0]));
    }
}
