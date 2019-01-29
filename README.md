# Cut-and-Project Tiling

This applet is an interactive demonstration of cut-and-project tiling.

![sample screenshot](images/screenshot.png)

Cut-and-project tilings are made by a 2-dimensional plane cutting through a higher dimensional square lattice. Lattice points in the neighborhood of the cutting plane are projected onto the plane and connected by edges to create the tiling. The well-known Penrose tiling is among the many tilings that can be generated this way.

[Try it on github.io!](https://gglouser.github.io/cut-and-project-tiling/)

[Explanation of controls](docs/intro.md) and how it works.

Check out a small [gallery of examples](docs/gallery.md).

## Requirements

This applet is (currently) plain old ES6 JavaScript. It requires HTML canvas support.

## Acknowledgments

I drew inspiration from [Quasitiler](http://www.geom.uiuc.edu/apps/quasitiler/about.html). My favorite feature borrowed from it is the axis control rosette. Before that, I was trying to control the orientation of the cutting plane with angles, and Quasitiler's way is far superior.
