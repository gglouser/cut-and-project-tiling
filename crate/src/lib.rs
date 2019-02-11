#[macro_use]
extern crate cfg_if;

extern crate wasm_bindgen;
use wasm_bindgen::prelude::*;

extern crate vectors;

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

pub mod multigrid;

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
pub struct FaceList {
    faces: Vec<Face>
}

#[wasm_bindgen]
impl FaceList {
    pub fn get_num_faces(&self) -> usize {
        self.faces.len()
    }

    pub fn get_face(&self, i: usize) -> Face {
        self.faces[i].clone()
    }
}
