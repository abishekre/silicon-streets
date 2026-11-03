[out:json][timeout:90];
(
  way["highway"](12.9665,77.5880,12.9840,77.6140);
  way["building"](12.9665,77.5880,12.9840,77.6140);
  way["leisure"](12.9665,77.5880,12.9840,77.6140);
  relation["leisure"](12.9665,77.5880,12.9840,77.6140);
  way["landuse"](12.9665,77.5880,12.9840,77.6140);
  way["natural"~"water|wood"](12.9665,77.5880,12.9840,77.6140);
  way["railway"](12.9665,77.5880,12.9840,77.6140);
  node["railway"="station"](12.9665,77.5880,12.9840,77.6140);
  node["amenity"~"cafe|restaurant|fast_food|pub|bar|ice_cream"](12.9665,77.5880,12.9840,77.6140);
);
out geom tags;
