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

    fn get_face_vertex(&self, a1: usize, a2: usize, k1: f64, k2: f64) -> DVector<f64> {
        // Find the intersection (a,b) of the grid lines k1 and k2.
        let u = k1 + 0.5 - self.offset[a1];
        let v = k2 + 0.5 - self.offset[a2];
        let a = (u*self.basis[(1,a2)] - v*self.basis[(1,a1)]) / self.ext_prod[a1][a2];
        let b = (v*self.basis[(0,a1)] - u*self.basis[(0,a2)]) / self.ext_prod[a1][a2];

        // Find the coordinates of the key vertex for the face
        // corresponding to this intersection.
        self.unproject(Vector2::new(a, b)).map_with_location(|ax, _, x| {
            // Round each component of the unprojected vector to an integer.
            // Here we round the value x corresponding with axis ax.

            // If ax is a1 or a2, then we can just use the known grid line that
            // was given as a function parameter.
            if ax == a1 {
                k1
            } else if ax == a2 {
                k2

            // Next, check for singular multigrid.
            //
            // The unprojected point is the intersection of a grid line from axis a1
            // and a grid line from axis a2. We need to check whether the nearest
            // grid line from axis ax also passes through this intersection. If it does,
            // the multigrid is called "singular" and the tiling is ambiguous.
            //
            // The intersection is on a grid line of axis ax if x has a fractional
            // part of 0.5. The ambiguity of the tiling corresponds to the ambiguity
            // of rounding up or down for a number with fractional part 0.5.
            // We resolve the ambiguity in the following way: if axis ax lies between
            // axis a1 and axis a2 on the cutting plane, then round up.
            // Otherwise, round down.
            } else if (x - x.floor() - 0.5).abs() > 1e-10 {
                // Normal (non-singular) case.
                x.round()
            } else if self.axis_between(a1, a2, ax) {
                x.ceil()
            } else {
                x.floor()
            }
        })
    }

    // Test whether axis ax is between axes a1 and a2.
    // We can assume that a1 != ax != a2 and that axes a1 and a2 are not parallel.
    fn axis_between(&self, a1: usize, a2: usize, ax: usize) -> bool {
        if self.ext_prod[a1][ax].abs() < EPSILON {
            // Axes a1 and ax are parallel. Consider ax to lie between
            // if a1 and ax point the same direction AND ax < a1.
            self.basis.column(a1).dot(&self.basis.column(ax)) > 0.0 && ax < a1
        } else if self.ext_prod[ax][a2].abs() < EPSILON {
            // Axis ax and a2 are parallel. Consider ax to lie between
            // if ax and a2 point the same direction AND ax < a2.
            self.basis.column(ax).dot(&self.basis.column(a2)) > 0.0 && ax < a2
        } else {
            // Axis ax lies between axis a1 and axis a2 if the rotation from
            // a1 to a2 is the same as a1 to ax and ax to a2.
            self.ext_prod[a1][a2]*self.ext_prod[a1][ax] > 0.0
                && self.ext_prod[a1][a2]*self.ext_prod[ax][a2] > 0.0
        }
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
