import Audit from "./audit";
import geoip from 'geoip-lite';
import memoize from 'memoizee';
import { variables } from "../references/references";
import { DEFAULT } from "../config/configuration";
import { sum } from "../bin/statistics";
import { isGreenServerMem } from "../helpers/isGreenServer";

/**
 * @fileoverview Compute gCO2eq considering server location, 
 *                  server greenness per individual resource.
 */


const MB_TO_BYTES = 1024 * 1024
const GB_TO_MB = 1024

export class CarbonFootprintAudit extends Audit{
    static get meta(){

        return {
            id:'carbonfootprint',
            title:`Website's carbon footprint is moderate`,
            failureTitle:`Website's carbon footprint is high`,
            description:`The carbon footprint is the total amount of greenhouse gases released into the atmosphere to directly and indirectly support a particular activity. Keeping it as low as possible it's key to prevent the climate change.`,
            category:'server',
            scoringType:'transfer'
        } as SA.Audit.Meta
    }

    static async audit(traces:SA.DataLog.TransferTrace):Promise<SA.Audit.Result| undefined>{
try{
        const getGeoLocation = (ip:string) => {
            //2 letter ISO-3166-1 country code https://www.iban.com/country-codes */
            const country = geoip.lookup(ip)?.country
            
            if(country){
                return country
            }

            return 'AVG'
                
            }

        const getGeoLocationMem = memoize(getGeoLocation)

        const getValidRecords = async () => {
                
                const getGreenRecord =  async () => {
                    const pArray = traces.record.map(async record =>{
                        const isGreen = await isGreenServerMem(record.response.remoteAddress.ip)
                        return isGreen.green
                    })
                    const isGreen = await Promise.all(pArray)
                    return traces.record.map((record,index)=>{

                        return {
                            id:record.request.requestId,
                            host:new URL(record.response.url).host,
                            size:record.CDP.compressedSize.value,
                            unSize:record.response.uncompressedSize.value,
                            ip:record.response.remoteAddress.ip,
                            isGreen:isGreen[index]
                        }
    
                    })
                    }



                const records = await getGreenRecord()

                return records.map(record=>{

                    //TODO: Bring the carbon data by regions first
                   /* if(record.isGreen === false){
                        const location = getGeoLocationMem(record.ip)

                        return {
                            ...record,
                            location
                        }
                    }*/

                    return record
                })
            }

        const records = await getValidRecords();
       const totalTransfersize = sum(records.
       map((record:any)=>record.size>0?record.size:record.unSize))

       const recordsByFileSize = traces.record.reduce((acc,record)=>{
        acc[record.request.resourceType] = (acc[record.request.resourceType])? acc[record.request.resourceType] +=
            (record.CDP.compressedSize.value>0?record.CDP.compressedSize.value:record.response.uncompressedSize.value):
            (record.CDP.compressedSize.value>0?record.CDP.compressedSize.value:record.response.uncompressedSize.value) 
        return acc
    }, {} as Record<string, number>)
    



    const recordsByFileSizePercentage= Object.keys(recordsByFileSize).map((key) =>{
        const val = (recordsByFileSize[key]/totalTransfersize*100).toFixed(2)

        return {
            [key]:val
        }
    })


        const totalWattage= records.
        map((record:any)=>{
            let size;
            if(record.size !==0){
                size = record.size
            }else{
                size = record.unSize
            }

           
            
            size = size/(MB_TO_BYTES*GB_TO_MB)
            if(record.isGreen){
                size*=variables.coreNetwork[0]
            }else{
                size*=(variables.dataCenter[0]+variables.coreNetwork[0])
            }
            
            return size
        })

    
        

        //apply references values
        const metric = sum(totalWattage)*variables.defaultCarbonIntensity[0]*
                        variables.defaultDailyVisitors[0]

        const {median, p10} = DEFAULT.REPORT.scoring.CF

        const score = Audit.computeLogNormalScore({median, p10}, metric)   
        const meta = Audit.successOrFailureMeta(CarbonFootprintAudit.meta, score)

        return {
            meta,
            score,
            scoreDisplayMode:'numeric',
            extendedInfo:{
                value:{
                    totalTransfersize:[totalTransfersize,'bytes'],
                    totalWattage:[sum(totalWattage).toFixed(10), 'kWh'],
                    carbonfootprint:[metric.toFixed(5), 'gCO2eq / 100 views'],
                    share:recordsByFileSizePercentage
                }
            }
            


        }
    }catch(error){
        console.log(error);
        
        
    }
    
}
}

