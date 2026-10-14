// Art direction is package data; GPU resources and rendering belong to the engine.
export default {
  zoom:16,exposure:1.12,sightEdge:4,
  sunlight:{color:0xffdfad,intensity:2.7},
  hemisphere:{sky:0xa5c6ef,ground:0x252c34,intensity:.85},
  terrain:{lavaBiomes:[4],ground:[0x567b36,0xaa7142,0x375950,0xb4cdd1,0x403948],roads:[0x8d8155,0xc0905e,0x77775c,0x85949c,0x655769],water:0x3c777c,lava:0xeb602b,bridge:0x85613f},
  props:[
    {tree:true,trunk:0x65513a,leaves:0x3d692e,stone:0x697778,cap:0x81837a},
    {trunk:0x65513a,leaves:0x879a51,stone:0x976443,cap:0x81837a},
    {tree:true,trunk:0x65513a,leaves:0x385a48,stone:0x697778,cap:0x81837a},
    {tree:true,debris:0xe7edef,crystal:0xa7e8ee,trunk:0x635d55,leaves:0x526b65,stone:0x697778,cap:0xdce5e5,snow:0xe0e8e4},
    {trunk:0x65513a,leaves:0x697575,stone:0x302937,cap:0x81837a},
  ],
};
