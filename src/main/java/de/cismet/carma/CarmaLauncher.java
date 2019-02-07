/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */
package de.cismet.carma;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.threerings.getdown.launcher.GetdownApp;
import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import org.apache.commons.lang3.exception.ExceptionUtils;

/**
 *
 * @author jruiz
 */
public class CarmaLauncher {

    private static final org.apache.log4j.Logger LOG = org.apache.log4j.Logger.getLogger(CarmaLauncher.class);
    
    private final static ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final File carmaFile;
    
    public CarmaLauncher(final File carmaFile) {
        this.carmaFile = carmaFile;
    }
    
    public void launch(final File workingDir) throws Exception {
        final CarmaDescription carmaDescription = OBJECT_MAPPER.readValue(carmaFile, CarmaDescription.class);                
        
        final File appDir = new File(workingDir, carmaDescription.getName());
        if (!appDir.exists()) {
            appDir.mkdirs();
        }               

        final File getDownFile = new File(appDir, "getdown.txt");
        
        try (PrintWriter printWriter = new PrintWriter(new FileWriter(getDownFile))) {
            printWriter.printf("appbase=%s\n", carmaDescription.getBase());
            printWriter.close();
        }
        
        GetdownApp.start(new String[] { appDir.getCanonicalPath() });
    }

    public static void main(String[] args) {
        try {
            org.apache.log4j.PropertyConfigurator.configure(CarmaLauncher.class.getResource("log4j.properties")); // NOI18N
        } catch (final Exception ex) {
            System.err.println(ExceptionUtils.getStackTrace(ex));
        }
        
        try {                                    
            if (args.length > 0) {
                new CarmaLauncher(new File(args[0])).launch(new File(Environment.CARMA_HOME.getValue()));
            } else {
                new CarmaLauncher(new File("./src/main/resources/test.carma.json")).launch(new File("./target/carma/"));                                    
            }
        } catch (final Exception ex) {
            LOG.error("Error while launching with these args:\n" + String.join("\n", args), ex);
        }
    }
    
}