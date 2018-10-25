var d3           = require('d3');
var _            = require('lodash');
var NetworkLayer = require('./NetworkLayer.js');
/**
 * ```
 editorLayer = EditorLayer({
 svg: bg.append("g"),
 onLatLngToXy: map.onLatLngToXy()
 }).onAdjacencyEvent('click', cktClick)
 .onPopEvent('mouseenter',function(d){
 d3.select(d.event.target).style("cursor", "grab");
 lmap.dragging.disable();
 })
 .onPopEvent('mouseout' ,function(d){
 d3.select(d.event.target).style("cursor", "default");
 lmap.dragging.enable();
 })
 .onXyToLatLng(function(xy){
 var latlng = lmap.layerPointToLatLng(L.point(xy[0], xy[1]));
 return [latlng.lat, latlng.lng];
 })
 .onEdit(function(){
 map.topology(editorLayer.topology());
 })
 .topology(topology);

 ```
 * @class EditorLayer
 * @extends NetworkLayer
 * @constructor
 * @static
 * @param {Object} params - The configuration parameters
 * @param {d3.selection(svg):Required} params.svg - A d3 selection of the svg element to render the editor layer into 
 * @param {Function} params.onLatLngToXy - A function defining how to convert a lat/lng coordinate to an xy coordinate 
 */

var EditorLayer = function(params){
    var layer = NetworkLayer(params);

    if(!params.svg){
        console.error("Must provide svg element to render into");
    }
    //add an id and class to the layer
    var svg = params.svg;
    svg.attr('id', layer.layerId());
    svg.attr('class', 'editor');

    //interpolate the editro lines as straight lines
    var line = d3.svg.line()
        .interpolate("linear")
        .x(function(d) { 
            return layer.latLngToXy([d.lat,d.lon])[0] 
        })
        .y(function(d) {
            return layer.latLngToXy([d.lat,d.lon])[1]
        });

    /**
     * Getter/Setter of the onEdit function
     * @method onEdit
     * @param {Function} value - Method that defines what to do when the layer is edited 
     * @chainable
     */
    layer.onEdit = function(value){
        if(!arguments.length){ return onEdit; }
        onEdit = value;
        return layer;
    };

    /**
     * Getter/Setter of the onEditEnd function
     * @method onEditEnd
     * @param {Function} value - Method that defines what to do when the layer is finished being edited 
     * @chainable
     */
    layer.onEditEnd = function(value){
        if(!arguments.length){ return onEditEnd; }
        onEditEnd = value;
        return layer;
    };

    //update the layer any time the topology is set
    layer.onTopology(function(topology, params){
        layer.update(topology, params);
    });

    //define the behavior when dragging a point on the editor layer
    var drag = d3.behavior.drag()
        .origin(function(d) {
            return {
                x: layer.latLngToXy([d.lat,d.lon])[0],
                y: layer.latLngToXy([d.lat,d.lon])[1]
            };
        })
        .on("drag", function(d){
            //--- figure out the event x,y then inverse project
            var newLatLng = layer.xyToLatLng([d3.event.x, d3.event.y]);

            //--- set the x,y on the circle
            d3.select(this)
                .attr("cx", d.x = d3.event.x)
                .attr("cy", d.y = d3.event.y);

            //--- upate the data values hopefully  !!!! need to hide the goofy leaflet use of .lng
            d.lat = newLatLng[0];
            d.lon = newLatLng[1];


            //--- if it was an endpoint that was moved on an adjacency we want to sync the relevant
            //--- pop coordinate with the new location and sync any adjacencies endpoints that terminate
            //--- on that pop 
            var updateArgs = (d.endpoint) ? { adj_moved: d } : undefined;

            //--- rerender the whole layer so that the lines update too
            layer.update(layer.topology(), updateArgs);

            //--- signal change 
            onEdit.call(layer);
        })
        .on('dragend',function(d){
            onEditEnd.call(layer);
        });

    //instuct how to get the adjacency elements
    layer.onLinks(function(){
        return svg.selectAll("g.adjacency");
    });

    //instuct how to get the pop elements
    layer.onEndpoints(function(){
        return svg.selectAll("g.pop");
    });

    //instuct how to update the layer 
    layer.onUpdate(function(topology, params){
        params = params || {};

        if(!layer.topology()){
            console.warn('No topology set, skipping update for '+layer.name());
            return;
        }

        // sync pop and relavent adjacency endpoints if necessary
        if(!_.isEmpty(params) && (params.adj_moved || params.pop_moved)){
            layer.topology().syncAdjEndpoints(params);
        }

        //--- Render Links
        var links = layer.links()
            .data(layer.topology().data().links, function(d){
                return d.linkId;
            });

        //--- ENTER -- add any new adjacencies
        var linksEnter = links.enter()
            .append("g")
            .attr("id", function(d) { return d.linkId; })
            .attr("class","adjacency");

        //add a shadow path for new adjacencys
        linksEnter.append("path")
            .attr("d",function(d){
                return line(d.path)
            })
            .attr("class","editorShadow")
            .call(function(selection){
                _.forEach(layer.onLinkEvent(), function(callback, evt){
                    selection.on(evt, function(d){
                        callback({
                            event: d3.event,
                            data:  d
                        });
                    });
                });
            });

        //add a highlight path for new links
        linksEnter.append("path")
            .attr("d",function(d){
                return line(d.path)
            })
            .attr("class","editorHighlight")
            .call(function(selection){
                _.forEach(layer.onLinkEvent(), function(callback, evt){
                    selection.on(evt, function(d){
                        callback({
                            event: d3.event,
                            data:  d
                        });
                    });
                });
            });


        //add the control points along the path
        linksEnter.append('g').attr('class', 'adjacency-control-points')
            .selectAll('circle.control-point')
            .data(function(d){ return d.path; })
            .enter().append('circle')
            .attr("cx", function (d){ 
                return layer.latLngToXy([d.lat,d.lon])[0]; 
            })
            .attr("cy", function (d){ 
                return layer.latLngToXy([d.lat,d.lon])[1]; 
            })
            .attr("r", "6px")
            .classed("control-point", true)
            .classed("hidden", function(d){
                return (!d.endpoint);
            })
            .call(function(selection){
                _.forEach(layer.onEndpointEvent(), function(callback, evt){
                    selection.on(evt, function(d){
                        callback({
                            event: d3.event,
                            data:  d
                        });
                    });
                });
            })
            .call(drag);

        //--- UPDATE -- update the paths of any existing links

        //update shadow path
        links.select(".editorShadow")
            .attr("d",function(d){
                return line(d.path)
            })
        //update highlight path
        links.select(".editorHighlight")
            .attr("d",function(d){
                return line(d.path)
            })

        var endpoints = links.selectAll('circle.control-point')
            .data(function(d){ 
                return d.path; 
            },function(d){ 
                return d.waypointId;
            });

        
        endpoints.attr("d",  function (d){
            return d; 
        })
            .attr("cx", function (d){ 
                return layer.latLngToXy([d.lat,d.lon])[0]; 
            })
            .attr("cy", function (d){ 
                return layer.latLngToXy([d.lat,d.lon])[1]; 
            })
            .classed('end-point',function(d,i){
                return d.endpoint;
            });

        endpoints.enter().append('circle')
            .attr("r", "6px")
            .classed("control-point", true)
            .call(function(selection){
                _.forEach(layer.onEndpointEvent(), function(callback, evt){
                    selection.on(evt, function(d){
                        callback({
                            event: d3.event,
                            data:  d
                        });
                    });
                });
            })
            .call(drag);
        
        //--- EXIT -- remove any links we no longer need
        links.exit().remove();
        endpoints.exit().remove();
    });

    return layer;
};
module.exports = EditorLayer;
